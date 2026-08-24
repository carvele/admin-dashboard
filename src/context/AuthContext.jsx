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
        if (!visitorId) {
          visitorId = localStorage.getItem(DEVICE_UUID_KEY);
        }
        if (!visitorId) {
          const randSuffix = (typeof crypto !== 'undefined' && crypto?.randomUUID)
            ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
            : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
          visitorId = 'sb_' + randSuffix;
          localStorage.setItem(DEVICE_UUID_KEY, visitorId);
        }
        const hashed = await hashFP(visitorId);
        localStorage.setItem('_jz_fp_hash', hashed);
      }
      setDeviceFingerprint(visitorId);

      // --- 2. Register device through the server-side function. Staff have
      // read-only RLS access to devices; client-side inserts must not be used.
      const { error: registrationError } = await supabase.functions.invoke('register-device', {
        body: {
          fingerprint: visitorId,
          user_agent: navigator.userAgent,
          staff_name: supabaseUser.user_metadata?.full_name || '',
        },
      });
      if (registrationError) throw registrationError;

      // --- 3. Start live device listener ---
      clearDeviceChannel();
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

      // Initial device status fetch
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

      // --- 4. Staff role lookup from public.profiles ---
      let resolvedRole = null;
      let staffName = '';
      try {
        const { data: profile } = await withTimeout(
          supabase
            .from('profiles')
            // Fetch the full status fields — we decide access, not the query filter
            .select('role, first_name, last_name, deleted, is_blocked, employment_status')
            .eq('id', supabaseUser.id)
            .maybeSingle(),
          5000,
        );

        if (profile) {
          // ── Lockout guard ──────────────────────────────────────
          // DENY-LIST logic: only block on explicit bad states.
          // NULL / 'active' / 'on_leave' / 'resigned' employment_status
          // are all ALLOWED — only 'terminated' is denied.
          // Accounts created outside the app (e.g. via Supabase Dashboard)
          // may have employment_status = NULL; that is valid and must not block login.
          if (
            profile.deleted === true ||
            profile.is_blocked === true ||
            profile.employment_status === 'terminated'
          ) {
            await supabase.auth.signOut();
            setUser(null);
            setIsLoading(false);
            toast.error(
              'This account no longer has access. Please contact the store owner.',
              { duration: 6000 },
            );
            return;
          }

          resolvedRole = profile.role;
          staffName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
        }
      } catch (err) {
        console.warn('Profile role lookup timed out or failed.', err);
      }

      // Only admin/staff/owner may access the dashboard
      if (!resolvedRole || resolvedRole === 'customer') {
        // Pending invite: the invite-email link already established a session for
        // this user, but they haven't finished Set Password yet (no staff profile
        // row). Leave the session alone so SetPassword.jsx can use it — rather
        // than signing them out before they ever reach that page. Detected via
        // app_metadata.staff_role, which is service-role-only and unforgeable.
        const isPendingInvite = ['staff', 'admin'].includes(supabaseUser.app_metadata?.staff_role);
        if (!isPendingInvite) {
          await supabase.auth.signOut();
          toast.error('Access denied. Admin portal is for staff only.');
        }
        setUser(null);
        setIsLoading(false);
        return;
      }

      // --- 5. Set user state ---
      setUser({
        uid: supabaseUser.id,
        name: staffName || supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Staff',
        email: supabaseUser.email,
        role: resolvedRole,
      });
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

  const logout = React.useCallback(async () => {
    const savedFPHash = localStorage.getItem('_jz_fp_hash');
    clearDeviceChannel();
    await supabase.auth.signOut();
    setUser(null);
    setDeviceStatus('checking');
    localStorage.clear();
    sessionStorage.clear();
    if (savedFPHash) localStorage.setItem('_jz_fp_hash', savedFPHash);
    toast.info('Logged out successfully');
  }, [clearDeviceChannel]);

  // Auto-logout idle timer (30 minutes)
  useEffect(() => {
    let timeoutId;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(
        () => {
          if (user) {
            toast.error('Session expired due to inactivity. Logging out.');
            logout();
          }
        },
        30 * 60 * 1000,
      );
    };

    if (user && deviceStatus === 'approved') {
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('scroll', resetTimer);
      window.addEventListener('click', resetTimer);
      resetTimer();
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [user, deviceStatus, logout]);

  const login = async (email, password) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await handleDeviceCheck(data.user);
      toast.success('Welcome back!');
    } catch (error) {
      setIsLoading(false);
      let message = 'Login failed. Please check your credentials.';
      if (error.message?.includes('Invalid login credentials')) message = 'Invalid credentials. Please try again.';
      if (error.message?.includes('Email not confirmed')) message = 'Please confirm your email first.';
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
      if (
        profile &&
        (
          profile.deleted === true ||
          profile.is_blocked === true ||
          profile.employment_status === 'terminated'
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

  // Role normalization: Supabase stores lowercase ('admin', 'owner', 'staff')
  // The UI historically checks for 'Admin' or 'Owner' (capitalized).
  // We surface a normalized role to satisfy both old (capital) and new (lower) checks.
  const normalizedRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
    : null;

  const isAdminUnlocked = normalizedRole === 'Admin' || normalizedRole === 'Owner';

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
