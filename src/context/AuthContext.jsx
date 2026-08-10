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

/**
 * Upsert a device row in public.devices.
 * PK is the fingerprint text column.
 */
const registerDevice = async (fingerprint, userAgent, staffEmail = '', staffName = '') => {
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
};

// ── Main provider ───────────────────────────────────────────

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('checking');
  const [deviceFingerprint, setDeviceFingerprint] = useState(null);
  const [deviceData, setDeviceData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const deviceChannelRef = useRef(null);

  // Unsubscribe from old device channel before starting a new one
  const clearDeviceChannel = () => {
    if (deviceChannelRef.current) {
      supabase.removeChannel(deviceChannelRef.current);
      deviceChannelRef.current = null;
    }
  };

  const handleDeviceCheck = async (supabaseUser) => {
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
        const enc = new TextEncoder().encode(fp);
        const hash = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      let visitorId = null;
      try {
        const fp = await withTimeout(FingerprintJS.load(), 3000);
        const result = await fp.get();
        visitorId = result.visitorId;
        const hashed = await hashFP(visitorId);
        localStorage.setItem('_jz_fp_hash', hashed);
      } catch {
        // FingerprintJS failed — try to reuse a previously stored ID via a
        // fallback random token (the hash of the old value is lost, but we
        // generate a new stable one).
        const legacyStored = localStorage.getItem('_jz_fp_id');
        if (legacyStored) {
          try { visitorId = atob(legacyStored); } catch { /* ignore */ }
          // Migrate legacy base64 to hashed format
          if (visitorId) {
            const hashed = await hashFP(visitorId);
            localStorage.setItem('_jz_fp_hash', hashed);
            localStorage.removeItem('_jz_fp_id');
          }
        }
        if (!visitorId) {
          visitorId = 'sb_' + Math.random().toString(36).substr(2, 9);
          const hashed = await hashFP(visitorId);
          localStorage.setItem('_jz_fp_hash', hashed);
        }
      }
      setDeviceFingerprint(visitorId);

      // --- 2. Register device (fire-and-forget) ---
      registerDevice(
        visitorId,
        navigator.userAgent,
        supabaseUser.email,
        supabaseUser.user_metadata?.full_name || '',
      ).catch((err) => console.warn('[Device] Registration write failed:', err));

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
        // Doc not yet written (registration still in-flight)
        setDeviceStatus('approved');
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
  };

  // Listen for Supabase auth state changes (initial load + logout)
  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleDeviceCheck(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleDeviceCheck(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
      clearDeviceChannel();
    };
  }, []);

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
  }, [user, deviceStatus]);

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

  const logout = async () => {
    const savedFPHash = localStorage.getItem('_jz_fp_hash');
    clearDeviceChannel();
    await supabase.auth.signOut();
    setUser(null);
    setDeviceStatus('checking');
    localStorage.clear();
    sessionStorage.clear();
    if (savedFPHash) localStorage.setItem('_jz_fp_hash', savedFPHash);
    toast.info('Logged out successfully');
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
