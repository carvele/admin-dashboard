import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import * as FingerprintJS from '@fingerprintjs/fingerprintjs';
import { supabase } from '../lib/supabaseClient';
import { toCamel } from '../lib/supabaseService';
import SessionTimeoutModal from '../components/auth/SessionTimeoutModal';

const AuthContext = createContext(null);

// Race a promise against a timeout so the app never freezes
const withTimeout = (promise, ms = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);

// Lightweight pure JS SHA-256 fallback for non-secure contexts where crypto.subtle is undefined
function fallbackSha256(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  ascii += '\x80';
  while (ascii.length % 64 !== 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = Math.floor(asciiBitLength / maxWord);
  words[words.length] = asciiBitLength & 0xffffffff;

  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = [...hash];

    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1 + ch + k[i] + w[i]) | 0;
      const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0 + maj) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  return hash.map(h => ((h >>> 0).toString(16).padStart(8, '0'))).join('');
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('checking');
  const [deviceFingerprint, setDeviceFingerprint] = useState(null);
  const [deviceData, setDeviceData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Unified timeout state machine: ACTIVE | IDLE_WARNING | VISIBILITY_WARNING | SIGNING_OUT
  const [sessionTimeoutState, setSessionTimeoutState] = useState('ACTIVE');
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  const deviceChannelRef = useRef(null);
  const userRef = useRef(null);
  const isIntentionalSignOutRef = useRef(false);
  const initialSessionCheckedRef = useRef(false);

  // Lockout concurrency and stale result protection
  const lockoutCheckGenerationRef = useRef(0);
  const lockoutDebounceTimerRef = useRef(null);
  const lockoutInFlightRef = useRef(false);

  // Timeout and activity tracking references
  const lastActivityTimeRef = useRef(Date.now());
  const idleTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const lastActivityThrottleRef = useRef(0);

  // Industry standard e-commerce admin session: 7 days of inactivity (e.g. Google, Shopify, Stripe)
  const LAST_ACTIVITY_STORAGE_KEY = 'jezsy_admin_last_activity';
  const IDLE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days of inactivity
  const IDLE_WARNING_BUFFER_MS = 5 * 60 * 1000; // 5 minutes warning
  const IDLE_WARNING_TIME_MS = IDLE_LIMIT_MS - IDLE_WARNING_BUFFER_MS;
  const VISIBILITY_COUNTDOWN_SECONDS = 60;

  // Unsubscribe from old device channel before starting a new one
  const clearDeviceChannel = useCallback(() => {
    if (deviceChannelRef.current) {
      supabase.removeChannel(deviceChannelRef.current);
      deviceChannelRef.current = null;
    }
  }, []);

  // Intentional sign out with safe storage preservation
  const doSignOut = useCallback(async (message, toastOptions) => {
    if (isIntentionalSignOutRef.current) return;
    isIntentionalSignOutRef.current = true;

    // Clear timeout timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (lockoutDebounceTimerRef.current) clearTimeout(lockoutDebounceTimerRef.current);

    try { localStorage.removeItem('jezsy_admin_last_activity'); } catch {}

    clearDeviceChannel();

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[doSignOut] Supabase signOut error:', err);
    }

    userRef.current = null;
    setUser(null);
    setDeviceStatus('checking');
    setSessionTimeoutState('ACTIVE');
    setCountdownSeconds(0);

    // Note: Never call localStorage.clear(). Supabase manages its own auth token storage.
    // User preferences and persistent device fallbacks are preserved.

    if (message) {
      toast.info(message, toastOptions);
    }

    setTimeout(() => {
      isIntentionalSignOutRef.current = false;
    }, 1000);
  }, [clearDeviceChannel]);

  const logout = useCallback(
    () => doSignOut('Logged out successfully'),
    [doSignOut]
  );

  const handleIdleLogout = useCallback(
    () => doSignOut('Your session has expired due to 7 days of inactivity. Please sign in again.', { duration: 6000 }),
    [doSignOut]
  );

  // Full device and staff profile check (for initial sign-in and verified session restoration)
  const handleDeviceCheck = useCallback(async (supabaseUser) => {
    if (!supabaseUser) {
      clearDeviceChannel();
      userRef.current = null;
      setUser(null);
      setDeviceStatus('checking');
      setIsLoading(false);
      return;
    }

    try {
      let resolvedRole = null;
      let staffName = '';
      let profile = null;
      let profileFetchAttempt = 0;
      let hadTransientNetworkError = false;
      let querySucceeded = false;

      // Retry up to 3 times to prevent kicking out valid users during transient wake/network lag
      while (profileFetchAttempt < 3 && !profile) {
        profileFetchAttempt++;
        try {
          const { data, error: profileErr } = await withTimeout(
            supabase
              .from('profiles')
              .select('role, first_name, last_name, deleted, is_blocked, employment_status')
              .eq('id', supabaseUser.id)
              .maybeSingle(),
            5000,
          );

          if (profileErr) {
            hadTransientNetworkError = true;
            console.warn(`[handleDeviceCheck] Attempt ${profileFetchAttempt} profile fetch error:`, profileErr.message);
          } else {
            querySucceeded = true;
            profile = data;
            break;
          }
        } catch (err) {
          hadTransientNetworkError = true;
          console.warn(`[handleDeviceCheck] Attempt ${profileFetchAttempt} profile lookup timed out or failed:`, err);
        }

        if (profileFetchAttempt < 3 && !profile) {
          await new Promise((resolve) => setTimeout(resolve, 500 * profileFetchAttempt));
        }
      }

      if (profile) {
        // Lockout guard: only block on explicit confirmed bad states
        const isActive = !profile.employment_status || profile.employment_status === 'active';
        if (
          profile.deleted === true ||
          profile.is_blocked === true ||
          !isActive
        ) {
          isIntentionalSignOutRef.current = true;
          await supabase.auth.signOut();
          userRef.current = null;
          setUser(null);
          setIsLoading(false);
          toast.error(
            'This account no longer has access. Please contact the store owner.',
            { duration: 6000 },
          );
          setTimeout(() => { isIntentionalSignOutRef.current = false; }, 1000);
          return;
        }

        resolvedRole = profile.role;
        staffName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
      }

      // Customer accounts attempting web dashboard access
      if (resolvedRole === 'customer') {
        isIntentionalSignOutRef.current = true;
        await supabase.auth.signOut();
        toast.error('Access restricted: This portal is for store staff and administrators only. Customer accounts must use the mobile application.', { duration: 6000 });
        userRef.current = null;
        setUser(null);
        setIsLoading(false);
        setTimeout(() => { isIntentionalSignOutRef.current = false; }, 1000);
        return;
      }

      // If no profile was resolved:
      if (!resolvedRole) {
        // Check for pending invite with unforgeable app_metadata
        const isPendingInvite = ['staff', 'admin', 'owner'].includes(supabaseUser.app_metadata?.staff_role);
        if (isPendingInvite) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        // If user already had a confirmed active session and this is a transient error, preserve session
        if (userRef.current && userRef.current.uid === supabaseUser.id) {
          console.warn('[handleDeviceCheck] Transient validation failure during active session; preserving session.');
          setIsLoading(false);
          return;
        }

        // If lookup failed due to network or database error, NEVER treat it as confirmed missing profile
        if (hadTransientNetworkError && !querySucceeded) {
          console.warn('[handleDeviceCheck] Network/database issue during profile validation; preserving session.');
          setIsLoading(false);
          return;
        }

        // Succeeded with zero rows: confirmed missing staff profile
        if (querySucceeded && !profile) {
          if (!isIntentionalSignOutRef.current) {
            isIntentionalSignOutRef.current = true;
            await supabase.auth.signOut();
            toast.error('Access restricted: No staff profile found for this account.');
            setTimeout(() => { isIntentionalSignOutRef.current = false; }, 1000);
          }
          userRef.current = null;
          setUser(null);
          setIsLoading(false);
          return;
        }
      }

      // Set user state
      const nextUser = {
        uid: supabaseUser.id,
        name: staffName || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Staff',
        email: supabaseUser.email,
        role: resolvedRole,
      };
      userRef.current = nextUser;
      setUser(nextUser);
      setIsLoading(false);

      // Asynchronous device fingerprinting & registration
      (async () => {
        try {
          const hashFP = async (fp) => {
            if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
              try {
                const enc = new TextEncoder().encode(fp);
                const hash = await crypto.subtle.digest('SHA-256', enc);
                return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
              } catch {
                /* ignore & fallback */
              }
            }
            return fallbackSha256(fp);
          };

          let visitorId = null;
          try {
            const fp = await withTimeout(FingerprintJS.load(), 6000);
            const result = await fp.get();
            visitorId = result.visitorId;
            const hashed = await hashFP(visitorId);
            localStorage.setItem('_jz_fp_hash', hashed);
          } catch {
            const DEVICE_UUID_KEY = '_jz_device_uuid';
            const legacyStored = localStorage.getItem('_jz_fp_id');
            if (legacyStored) {
              try { visitorId = atob(legacyStored); } catch { /* ignore */ }
              if (visitorId) {
                localStorage.setItem(DEVICE_UUID_KEY, visitorId);
                localStorage.removeItem('_jz_fp_id');
              }
            }
            if (!visitorId) {
              const storedFallback = localStorage.getItem('_jz_fallback_device_id') || localStorage.getItem(DEVICE_UUID_KEY);
              const cookieFallback = document.cookie.match(/(?:^|; )_jz_fp_cookie=([^;]*)/)?.[1];
              visitorId = storedFallback || cookieFallback || null;
            }
            if (!visitorId) {
              const randSuffix = (typeof crypto !== 'undefined' && crypto?.randomUUID)
                ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
                : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
              visitorId = 'sb_' + randSuffix;
              localStorage.setItem(DEVICE_UUID_KEY, visitorId);
            }
            localStorage.setItem('_jz_fallback_device_id', visitorId);
            try {
              const maxAge = 365 * 24 * 60 * 60;
              document.cookie = `_jz_fp_cookie=${visitorId}; path=/; max-age=${maxAge}; SameSite=Lax`;
            } catch { /* cookie write failed */ }
            const hashed = await hashFP(visitorId);
            localStorage.setItem('_jz_fp_hash', hashed);
          }
          setDeviceFingerprint(visitorId);

          // Register device through Edge Function
          try {
            const { error: registrationError } = await supabase.functions.invoke('register-device', {
              body: {
                fingerprint: visitorId,
                user_agent: navigator.userAgent,
                staff_name: supabaseUser.user_metadata?.full_name || '',
              },
            });
            if (registrationError) {
              console.warn('Device registration function returned an error:', registrationError);
            }
          } catch (invokeErr) {
            console.warn('Device registration network call failed:', invokeErr);
          }

          // Live device listener
          clearDeviceChannel();
          try {
            const channel = supabase
              .channel(`device:${visitorId}`)
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'devices', filter: `fingerprint=eq.${visitorId}` },
                async () => {
                  const { data } = await supabase
                    .from('devices')
                    .select('*')
                    .eq('fingerprint', visitorId)
                    .maybeSingle();
                  if (data) {
                    const row = toCamel(data);
                    setDeviceData(row);
                    setDeviceStatus(row.status);
                  }
                },
              )
              .subscribe();
            deviceChannelRef.current = channel;
          } catch (channelErr) {
            console.warn('Failed to subscribe to device realtime channel:', channelErr);
          }

          // Initial device status fetch
          try {
            const { data: deviceRow } = await supabase
              .from('devices')
              .select('*')
              .eq('fingerprint', visitorId)
              .maybeSingle();
            if (deviceRow) {
              const row = toCamel(deviceRow);
              setDeviceData(row);
              setDeviceStatus(row.status);
            } else {
              setDeviceStatus('pending');
            }
          } catch (devLookupErr) {
            console.warn('Device status lookup failed:', devLookupErr);
            setDeviceStatus('pending');
          }
        } catch (asyncErr) {
          console.error('Async device check failed:', asyncErr);
          setDeviceStatus('error');
        }
      })();
    } catch (err) {
      console.error('Auth check failed:', err);
      setDeviceStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [clearDeviceChannel]);

  // Auth state listener with event-specific dispatch
  useEffect(() => {
    // Check session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        let lastActive = Date.now();
        try {
          const stored = localStorage.getItem('jezsy_admin_last_activity');
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) lastActive = parsed;
          }
        } catch {}

        const elapsed = Date.now() - lastActive;
        if (elapsed >= IDLE_LIMIT_MS) {
          console.warn('[AuthContext] Session expired on mount due to prolonged inactivity (7 days).');
          doSignOut('Your session has expired due to 7 days of inactivity. Please sign in again.', { duration: 6000 });
          return;
        }
      }

      if (!initialSessionCheckedRef.current) {
        initialSessionCheckedRef.current = true;
        handleDeviceCheck(session?.user ?? null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer execution outside Supabase internal lock
      setTimeout(() => {
        if (event === 'SIGNED_OUT') {
          clearDeviceChannel();
          userRef.current = null;
          setUser(null);
          setDeviceStatus('checking');
          setIsLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token refresh: do not re-run device check or profile check
          if (session?.user && userRef.current) {
            userRef.current = {
              ...userRef.current,
              email: session.user.email,
            };
          }
          return;
        }

        if (event === 'INITIAL_SESSION') {
          if (!initialSessionCheckedRef.current) {
            initialSessionCheckedRef.current = true;
            handleDeviceCheck(session?.user ?? null);
          }
          return;
        }

        if (event === 'SIGNED_IN') {
          handleDeviceCheck(session?.user ?? null);
          return;
        }

        if (event === 'USER_UPDATED') {
          if (session?.user) {
            handleDeviceCheck(session.user);
          }
          return;
        }

        // Any other event
        if (session?.user && !userRef.current) {
          handleDeviceCheck(session.user);
        }
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
      clearDeviceChannel();
    };
  }, [handleDeviceCheck, clearDeviceChannel]);

  // Unified reset activity timer
  const resetActivityTimer = useCallback(() => {
    const now = Date.now();
    lastActivityTimeRef.current = now;
    try {
      localStorage.setItem('jezsy_admin_last_activity', String(now));
    } catch {}

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setSessionTimeoutState('ACTIVE');
    setCountdownSeconds(0);

    if (userRef.current) {
      idleTimerRef.current = setTimeout(() => {
        if (userRef.current) {
          setSessionTimeoutState('IDLE_WARNING');
        }
      }, IDLE_WARNING_TIME_MS);
    }
  }, [IDLE_WARNING_TIME_MS]);

  // Action for user clicking 'Stay logged in'
  const handleStayLoggedIn = useCallback(() => {
    resetActivityTimer();
  }, [resetActivityTimer]);

  // Countdown timer effect for IDLE_WARNING and VISIBILITY_WARNING
  useEffect(() => {
    if (sessionTimeoutState === 'IDLE_WARNING') {
      let remaining = 120;
      setCountdownSeconds(remaining);

      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setCountdownSeconds(remaining);
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current);
          setSessionTimeoutState('SIGNING_OUT');
          handleIdleLogout();
        }
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      };
    }

    if (sessionTimeoutState === 'VISIBILITY_WARNING') {
      let remaining = VISIBILITY_COUNTDOWN_SECONDS;
      setCountdownSeconds(remaining);

      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setCountdownSeconds(remaining);
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current);
          setSessionTimeoutState('SIGNING_OUT');
          handleIdleLogout();
        }
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      };
    }
  }, [sessionTimeoutState, handleIdleLogout]);

  // Idle session tracking and visibility change handler
  useEffect(() => {
    if (!user || deviceStatus !== 'approved') {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    const handleVisibilityChange = () => {
      if (!userRef.current) return;

      if (document.visibilityState === 'visible') {
        let lastActive = lastActivityTimeRef.current;
        try {
          const stored = localStorage.getItem('jezsy_admin_last_activity');
          if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
              lastActive = parsed;
              lastActivityTimeRef.current = parsed;
            }
          }
        } catch {}

        const elapsed = Date.now() - lastActive;

        if (elapsed >= IDLE_LIMIT_MS) {
          // Inactive for more than 7 days: clean session expiration
          console.warn('[AuthContext] Session expired due to prolonged inactivity (7 days).');
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          handleIdleLogout();
        } else {
          // Active within 7 days: keep session alive smoothly
          resetActivityTimer();
        }
      }
    };

    const handleUserActivity = () => {
      const now = Date.now();
      // If currently showing a warning, any interaction dismisses it and stays logged in
      if (sessionTimeoutState === 'IDLE_WARNING' || sessionTimeoutState === 'VISIBILITY_WARNING') {
        resetActivityTimer();
        return;
      }
      // Throttle event handling to avoid thrashing timers
      if (now - lastActivityThrottleRef.current > 10000) {
        lastActivityThrottleRef.current = now;
        resetActivityTimer();
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'pointerdown'];
    activityEvents.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    resetActivityTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      activityEvents.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, deviceStatus, resetActivityTimer, IDLE_WARNING_TIME_MS, IDLE_LIMIT_MS, sessionTimeoutState]);

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await handleDeviceCheck(data.user);
      toast.success('Welcome back!');
    } catch (error) {
      let message = 'Login failed. Please check your credentials.';
      if (error.message?.includes('Invalid login credentials') || error.message?.includes('invalid_credentials')) {
        message = 'Invalid email or password. Please try again.';
      } else if (error.message?.includes('Email not confirmed')) {
        message = 'Please confirm your email first.';
      } else if (error.message?.includes('restricted') || error.message?.includes('portal is for')) {
        message = error.message;
      }
      toast.error(message);
      throw error;
    }
  };

  // Debounced lockout check with generation counter and stale-result protection
  const checkLockout = useCallback(() => {
    const currentGen = ++lockoutCheckGenerationRef.current;

    if (lockoutDebounceTimerRef.current) {
      clearTimeout(lockoutDebounceTimerRef.current);
    }

    lockoutDebounceTimerRef.current = setTimeout(async () => {
      if (lockoutInFlightRef.current) return;
      lockoutInFlightRef.current = true;

      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;

        if (currentGen !== lockoutCheckGenerationRef.current) return;

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('deleted, is_blocked, employment_status')
          .eq('id', authUser.id)
          .maybeSingle();

        // Discard stale response if a newer check has started
        if (currentGen !== lockoutCheckGenerationRef.current) return;

        if (error) {
          console.warn('[checkLockout] Transient profile fetch error:', error.message);
          return;
        }

        const isActive = !profile?.employment_status || profile.employment_status === 'active';
        if (
          profile &&
          (
            profile.deleted === true ||
            profile.is_blocked === true ||
            !isActive
          )
        ) {
          clearDeviceChannel();
          await supabase.auth.signOut();
          userRef.current = null;
          setUser(null);
          setDeviceStatus('checking');
          toast.error(
            'This account no longer has access. Please contact the store owner.',
            { duration: 6000 },
          );
        }
      } catch (err) {
        console.warn('[checkLockout] Unexpected error during lockout check:', err);
      } finally {
        lockoutInFlightRef.current = false;
      }
    }, 400);
  }, [clearDeviceChannel]);

  const normalizedRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : null;

  const isAdminUnlocked = normalizedRole === 'Owner';

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: 'var(--cream)',
        }}
      >
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user: user ? { ...user, role: normalizedRole } : null,
        login,
        logout,
        checkLockout,
        isAdminUnlocked,
        deviceStatus,
        deviceFingerprint,
        deviceData,
        isLoading,
      }}
    >
      {children}
      <SessionTimeoutModal
        isOpen={sessionTimeoutState === 'IDLE_WARNING' || sessionTimeoutState === 'VISIBILITY_WARNING'}
        mode={sessionTimeoutState === 'IDLE_WARNING' ? 'idle' : 'visibility'}
        countdownSeconds={countdownSeconds}
        onStayLoggedIn={handleStayLoggedIn}
        onSignOut={logout}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
