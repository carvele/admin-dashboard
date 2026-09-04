import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import * as FingerprintJS from '@fingerprintjs/fingerprintjs';
import { supabase } from '../lib/supabaseClient';
import { toCamel } from '../lib/supabaseService';

const AuthContext = createContext(null);

// Utility: Race a promise against a timeout so the app never freezes
const withTimeout = (promise, ms = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);

// ── Device helpers ──────────────────────────────────────────
/*
 * Device registration is performed by the register-device Edge Function.
 * The browser may read status, but it must not write approval records.
 */
/*
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from('devices')
    .select('fingerprint, login_history')
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (!existing) {
    await supabase.from('devices').insert({
      fingerprint,
      status: 'pending',
      user_agent: userAgent,
      last_seen: now,
      name: userAgent ? userAgent.substring(0, 50) : 'Unknown Device',
      staff_email: staffEmail,
      staff_name: staffName,
      failed_attempts: 0,
      lockout_until: null,
      login_history: [{ email: staffEmail, time: now }],
    });
  } else {
    const history = Array.isArray(existing.login_history) ? existing.login_history : [];
    await supabase.from('devices').update({
      last_seen: now,
      ...(staffEmail && {
        staff_email: staffEmail,
        staff_name: staffName,
        login_history: [...history, { email: staffEmail, time: now }].slice(-20),
      }),
      updated_at: now,
    }).eq('fingerprint', fingerprint);
  }
}; */

// Lightweight pure JS SHA-256 fallback for non-secure HTTP contexts where crypto.subtle is undefined
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
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
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

// ── Main provider ───────────────────────────────────────────

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('checking');
  const [deviceFingerprint, setDeviceFingerprint] = useState(null);
  const [deviceData, setDeviceData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const deviceChannelRef = useRef(null);
  const userRef = useRef(null);
  const isIntentionalSignOutRef = useRef(false);

  // Unsubscribe from old device channel before starting a new one
  const clearDeviceChannel = React.useCallback(() => {
    if (deviceChannelRef.current) {
      supabase.removeChannel(deviceChannelRef.current);
      deviceChannelRef.current = null;
    }
  }, []);

  const handleDeviceCheck = React.useCallback(async (supabaseUser) => {
    if (!supabaseUser) {
      clearDeviceChannel();
      setUser(null);
      setDeviceStatus('checking');
      setIsLoading(false);
      return;
    }

    try {

      // --- 4. Staff / Admin / Owner role lookup from public.profiles ---
      let resolvedRole = null;
      let staffName = '';
      let profile = null;
      let profileFetchAttempt = 0;

      // Retry up to 3 times to prevent kicking out valid users during transient wake/network lag
      while (profileFetchAttempt < 3 && !profile) {
        profileFetchAttempt++;
        try {
          const { data, error: profileErr } = await withTimeout(
            supabase
              .from('profiles')
              // Fetch the full status fields — we decide access, not the query filter
              .select('role, first_name, last_name, deleted, is_blocked, employment_status')
              .eq('id', supabaseUser.id)
              .maybeSingle(),
            5000,
          );

          if (profileErr) {
            console.warn(`[handleDeviceCheck] Attempt ${profileFetchAttempt} profile fetch error:`, profileErr.message);
          } else {
            profile = data;
            break;
          }
        } catch (err) {
          console.warn(`[handleDeviceCheck] Attempt ${profileFetchAttempt} profile lookup timed out or failed:`, err);
        }

        if (profileFetchAttempt < 3 && !profile) {
          await new Promise((resolve) => setTimeout(resolve, 500 * profileFetchAttempt));
        }
      }

      if (profile) {
        // ── Lockout guard ──────────────────────────────────────
        // DENY-LIST logic: only block on explicit bad states.
        // Synchronized with DB is_staff_or_admin(): only NULL and 'active' are allowed.
        const isActive = !profile.employment_status || profile.employment_status === 'active';
        if (
          profile.deleted === true ||
          profile.is_blocked === true ||
          !isActive
        ) {
          isIntentionalSignOutRef.current = true;
          await supabase.auth.signOut();
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
        setUser(null);
        setIsLoading(false);
        setTimeout(() => { isIntentionalSignOutRef.current = false; }, 1000);
        return;
      }

      // If no profile was resolved after retries:
      if (!resolvedRole) {
        // Pending invite: the invite-email link already established a session for
        // this user, but they haven't finished Set Password yet (no staff profile
        // row). Leave the session alone so SetPassword.jsx can use it — rather
        // than signing them out before they ever reach that page. Detected via
        // app_metadata.staff_role, which is service-role-only and unforgeable.
        const isPendingInvite = ['staff', 'admin', 'owner'].includes(supabaseUser.app_metadata?.staff_role);
        if (isPendingInvite) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        // If user already had a confirmed active session and this is just a background network blip, do not kick them out
        if (userRef.current && userRef.current.uid === supabaseUser.id) {
          console.warn('[handleDeviceCheck] Transient network blip during session refresh; retaining active session.');
          setIsLoading(false);
          return;
        }

        if (!isIntentionalSignOutRef.current) {
          isIntentionalSignOutRef.current = true;
          await supabase.auth.signOut();
          toast.error('Access restricted: No staff profile found for this account.');
          setTimeout(() => { isIntentionalSignOutRef.current = false; }, 1000);
        }
        setUser(null);
        setIsLoading(false);
        return;
      }


      // --- 5. Set user state ---
      const nextUser = {
        uid: supabaseUser.id,
        name: staffName || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Staff',
        email: supabaseUser.email,
        role: resolvedRole,
      };
      userRef.current = nextUser;
      setUser(nextUser);

      setIsLoading(false); // Unblock rendering immediately!

      // --- Asynchronous Device Fingerprinting & Registration ---
      (async () => {
        try {
      // --- 1. Fingerprint ---
      // Device fingerprints are hashed before storing — cannot be reversed.
      // The plaintext fingerprint is only held in memory for the current session.
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
        // FingerprintJS failed/blocked (e.g. ad-blocker or offline) — check for persistent fallback UUID
        const DEVICE_UUID_KEY = '_jz_device_uuid';
        const legacyStored = localStorage.getItem('_jz_fp_id');
        if (legacyStored) {
          try { visitorId = atob(legacyStored); } catch { /* ignore */ }
          if (visitorId) {
            localStorage.setItem(DEVICE_UUID_KEY, visitorId);
            localStorage.removeItem('_jz_fp_id');
          }
        }
        // Stable fallback: reuse an existing fallback ID from localStorage or
        // a long-lived cookie before generating a brand-new random one.
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
        // Persist the fallback ID in both localStorage and a long-lived cookie
        // so subsequent sessions always reuse the same device identity.
        localStorage.setItem('_jz_fallback_device_id', visitorId);
        try {
          const maxAge = 365 * 24 * 60 * 60; // 1 year
          document.cookie = `_jz_fp_cookie=${visitorId}; path=/; max-age=${maxAge}; SameSite=Lax`;
        } catch { /* cookie write failed — localStorage alone is fine */ }
        const hashed = await hashFP(visitorId);
        localStorage.setItem('_jz_fp_hash', hashed);
      }
      setDeviceFingerprint(visitorId);

      // --- 2. Register device through the server-side function. Staff have
      // read-only RLS access to devices; client-side inserts must not be used.
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
        console.warn('Device registration network call failed (may be offline or transient network change):', invokeErr);
      }

      // --- 3. Start live device listener ---
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
          // Never fail open. A missing device row means registration or lookup
          // failed and must be reviewed, not silently approved.
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

  // Listen for Supabase auth state changes (initial load + logout)
  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleDeviceCheck(session?.user ?? null);
    });

    // Supabase's auth callback holds an internal lock while it runs. handleDeviceCheck
    // calls supabase.auth.signOut() in several branches, and calling an auth method
    // from inside the callback re-enters that lock, which manifests as
    // "RangeError: Maximum call stack size exceeded" and can corrupt the session,
    // producing later 401s and a forced logout. Deferring with setTimeout(0) runs
    // handleDeviceCheck after the callback returns, outside the lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        handleDeviceCheck(session?.user ?? null);
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
      clearDeviceChannel();
    };
  }, [handleDeviceCheck, clearDeviceChannel]);

  const doSignOut = React.useCallback(async (message, toastOptions) => {
    isIntentionalSignOutRef.current = true;
    const savedFPHash = localStorage.getItem('_jz_fp_hash');
    clearDeviceChannel();
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    userRef.current = null;
    setUser(null);
    setDeviceStatus('checking');
    localStorage.clear();
    sessionStorage.clear();
    if (savedFPHash) localStorage.setItem('_jz_fp_hash', savedFPHash);
    toast.info(message, toastOptions);
    setTimeout(() => {
      isIntentionalSignOutRef.current = false;
    }, 1000);
  }, [clearDeviceChannel]);

  const logout = React.useCallback(
    () => doSignOut('Logged out successfully'),
    [doSignOut]
  );

  const handleIdleLogout = React.useCallback(
    () => doSignOut('Your session has expired due to inactivity. Please sign in again.', { duration: 5000 }),
    [doSignOut]
  );

  // Auto-logout idle timer (30 minutes of inactivity)
  useEffect(() => {
    let timeoutId;
    let lastActivityTime = Date.now();
    const IDLE_LIMIT_MS = 30 * 60 * 1000;

    const resetTimer = () => {
      lastActivityTime = Date.now();
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (user) {
          handleIdleLogout();
        }
      }, IDLE_LIMIT_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        const elapsed = Date.now() - lastActivityTime;
        if (elapsed >= IDLE_LIMIT_MS) {
          handleIdleLogout();
        } else {
          resetTimer();
        }
      }
    };

    if (user && deviceStatus === 'approved') {
      const activityEvents = ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'scroll', 'touchstart', 'focus'];
      activityEvents.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
      document.addEventListener('visibilitychange', handleVisibilityChange);
      resetTimer();

      return () => {
        clearTimeout(timeoutId);
        activityEvents.forEach((ev) => window.removeEventListener(ev, resetTimer));
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [user, deviceStatus, handleIdleLogout]);

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

  /**
   * Background lockout check — called on every route change.
   * Silently signs out the user if their account has been archived,
   * blocked, or terminated since their session was last validated.
   */
  const checkLockout = async () => {
    // Only run if there is an active user session
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('deleted, is_blocked, employment_status')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error) {
        console.warn('[checkLockout] Profile fetch error:', error.message);
        return; // fail open — don't sign out on a fetch error
      }

      // !profile (row not found) is treated as fail-open: transient RLS/network
      // issues must not sign out a valid user. Only explicit bad flags trigger lockout.
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
        setUser(null);
        setDeviceStatus('checking');
        toast.error(
          'This account no longer has access. Please contact the store owner.',
          { duration: 6000 },
        );
      }
    } catch (err) {
      console.warn('[checkLockout] Unexpected error:', err);
    }
  };

  // Role normalization: Supabase stores lowercase ('owner', 'staff')
  // The UI historically checks for 'Owner' (capitalized).
  // We surface a normalized role to satisfy both old (capital) and new (lower) checks.
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
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
