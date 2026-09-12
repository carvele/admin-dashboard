import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
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

// Stable per-browser device identity for the trusted-device workflow.
//
// This deliberately does NOT use a computed browser fingerprint (canvas/
// WebGL/font signature, e.g. FingerprintJS's visitorId). That approach was
// tried here previously and confirmed broken live: every device row ever
// recorded had a distinct fingerprint, meaning the "same device" produced a
// different identity on nearly every visit, so an admin's approval never
// carried over to the next login. Fingerprints are also explicitly
// engineered by browsers to drift (anti-tracking measures), so they were
// never a sound basis for a security-relevant "remember this device"
// decision in the first place -- a random ID persisted locally, the way
// GitHub/Google "trusted device" cookies work, is the standard approach.
const DEVICE_ID_KEY = 'jz_device_id';
const DEVICE_ID_COOKIE = 'jz_device_id';

function getOrCreateDeviceId() {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
  } catch { /* localStorage unavailable (private mode, storage partitioning) */ }

  let id = null;
  try {
    id = document.cookie.match(new RegExp(`(?:^|; )${DEVICE_ID_COOKIE}=([^;]*)`))?.[1] || null;
  } catch { /* ignore */ }

  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  try { localStorage.setItem(DEVICE_ID_KEY, id); } catch { /* ignore */ }
  try {
    const maxAge = 365 * 24 * 60 * 60;
    document.cookie = `${DEVICE_ID_COOKIE}=${id}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch { /* cookie write failed */ }

  return id;
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

  // Lets PendingDeviceView offer "Check Again" instead of requiring a full
  // sign-out/sign-in cycle to re-poll approval status -- register_device is
  // idempotent, so calling it again is always safe and just refreshes
  // last_seen while returning the device's current status.
  const recheckDeviceStatus = useCallback(async () => {
    const deviceId = deviceFingerprint || getOrCreateDeviceId();
    try {
      const { data, error } = await supabase.rpc('register_device', {
        _fingerprint: deviceId,
        _user_agent: navigator.userAgent,
      });
      if (error) {
        toast.error('Could not check device status. Please try again.');
        return;
      }
      if (data) {
        setDeviceFingerprint(deviceId);
        setDeviceData(toCamel(data));
        setDeviceStatus(data.status);
        if (data.status === 'approved') {
          toast.success('Device approved.');
        } else if (data.status === 'pending') {
          toast.info('Still waiting on admin approval.');
        } else if (data.status === 'revoked') {
          toast.error('Access to this device has been revoked.');
        }
      }
    } catch (err) {
      console.error('recheckDeviceStatus failed:', err);
      toast.error('Could not check device status. Please try again.');
    }
  }, [deviceFingerprint]);

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

      // Device registration: a stable, locally-persisted device ID (see
      // getOrCreateDeviceId above), registered through the register_device
      // RPC -- a real, version-controlled, authorization-scoped function,
      // replacing an edge function this repo had no source for and that
      // failed silently (its errors were only ever console.warn'd).
      (async () => {
        try {
          const deviceId = getOrCreateDeviceId();
          setDeviceFingerprint(deviceId);

          const { data: deviceRow, error: registerError } = await supabase.rpc('register_device', {
            _fingerprint: deviceId,
            _user_agent: navigator.userAgent,
          });

          if (registerError) {
            console.error('Device registration failed:', registerError);
            setDeviceStatus('error');
            return;
          }

          if (deviceRow) {
            setDeviceData(toCamel(deviceRow));
            setDeviceStatus(deviceRow.status);
          }

          // Live device listener -- reflects an admin's approval instantly
          // via Realtime, without requiring a sign-out/sign-in cycle.
          clearDeviceChannel();
          try {
            const channel = supabase
              .channel(`device:${supabaseUser.id}:${deviceId}`)
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'devices', filter: `fingerprint=eq.${deviceId}` },
                async () => {
                  const { data } = await supabase
                    .from('devices')
                    .select('*')
                    .eq('fingerprint', deviceId)
                    .eq('user_id', supabaseUser.id)
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
        recheckDeviceStatus,
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
