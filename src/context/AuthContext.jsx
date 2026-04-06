import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import * as FingerprintJS from '@fingerprintjs/fingerprintjs';
import { registerDevice, getDeviceStatus, logAction, getStaffByEmail } from '../firebase/firestore';

const AuthContext = createContext(null);

// Utility: Race a promise against a timeout so the app never freezes
const withTimeout = (promise, ms = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('checking');
  const [deviceFingerprint, setDeviceFingerprint] = useState(null);
  const [deviceData, setDeviceData] = useState(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const deviceUnsubRef = useRef(() => {});

  const handleDeviceCheck = async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null);
      setDeviceStatus('checking');
      setIsLoading(false);
      return;
    }

    try {
      // --- 1. Fingerprint ---
      let visitorId = null;
      try {
        const stored = localStorage.getItem('_jz_fp_id');
        if (stored) visitorId = atob(stored);
      } catch (e) {
        // ignore decoding errors
      }

      try {
        const fp = await withTimeout(FingerprintJS.load(), 3000);
        const result = await fp.get();
        visitorId = result.visitorId;
        localStorage.setItem('_jz_fp_id', btoa(visitorId));
      } catch {
        if (!visitorId) {
          visitorId = 'fb_' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('_jz_fp_id', btoa(visitorId));
        }
      }
      setDeviceFingerprint(visitorId);

      // --- 2. Register device & start live listener ---
      // Fire-and-forget registration: the Firestore write runs to completion regardless
      // of network speed. On mobile, a 5s timeout was killing the write before it finished,
      // so the device doc was never created and never appeared in Device Management.
      registerDevice(
        visitorId,
        navigator.userAgent,
        firebaseUser.email,
        firebaseUser.displayName || '',
      ).catch((err) => console.warn('[Device] Registration write failed:', err));

      // Start the live listener immediately so the UI gets status as soon as the doc lands.
      deviceUnsubRef.current();
      deviceUnsubRef.current = getDeviceStatus(visitorId, (docSnap) => {
        if (docSnap) {
          setDeviceData(docSnap);
          setDeviceStatus(docSnap.status);
          if (docSnap.status === 'revoked') setIsAdminUnlocked(false);
        } else {
          // Doc not yet written (registration still in-flight on slow network).
          // Default to 'approved' so the user isn't stuck on a loading spinner.
          setDeviceStatus('approved');
        }
      });

      // --- 3. Staff role lookup ---
      let resolvedRole = null;
      let staffName = '';
      try {
        const staffDoc = await withTimeout(getStaffByEmail(firebaseUser.email), 5000);
        if (staffDoc) {
          resolvedRole = staffDoc.role;
          staffName = staffDoc.name;
        } else if (
          firebaseUser.email === 'admin@jezsy.com' ||
          firebaseUser.email === 'admin@jezsycollection.com'
        ) {
          resolvedRole = 'Owner';
        } else {
          await signOut(auth);
          setUser(null);
          setIsLoading(false);
          toast.error('Access denied. Admin portal is for staff only.');
          return;
        }
      } catch (err) {
        console.warn('Staff role lookup timed out or failed.', err);
        if (
          firebaseUser.email === 'admin@jezsy.com' ||
          firebaseUser.email === 'admin@jezsycollection.com'
        ) {
          resolvedRole = 'Owner';
        } else {
          await signOut(auth);
          setUser(null);
          setIsLoading(false);
          toast.error('Access denied. Admin portal is for staff only.');
          return;
        }
      }

      // --- 4. Set user & admin state ---
      setUser({
        uid: firebaseUser.uid,
        name: staffName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Staff',
        email: firebaseUser.email,
        role: resolvedRole,
      });

      setIsAdminUnlocked(resolvedRole === 'Admin' || resolvedRole === 'Owner');
    } catch (err) {
      console.error('Auth check failed:', err);
      setDeviceStatus('error');
    } finally {
      // ★ GUARANTEED: always unblock the UI — no matter what
      setIsLoading(false);
    }
  };

  // Listen for auth state changes (initial load + logout)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, handleDeviceCheck);
    
    // Background token refresher (every 10 minutes)
    const tokenRefreshInterval = setInterval(() => {
      if (auth.currentUser) {
        auth.currentUser.getIdToken(true).catch((err) => {
          console.error("Token refresh failed, ending session", err);
          logout();
        });
      }
    }, 10 * 60 * 1000);

    return () => {
      unsubscribe();
      clearInterval(tokenRefreshInterval);
      deviceUnsubRef.current();
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
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await handleDeviceCheck(cred.user);
      toast.success('Welcome back!');
    } catch (error) {
      setIsLoading(false);
      let message = 'Login failed. Please check your credentials.';
      if (error.code === 'auth/user-not-found') message = 'No account found with this email.';
      if (error.code === 'auth/wrong-password') message = 'Incorrect password.';
      if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
      if (error.code === 'auth/invalid-credential')
        message = 'Invalid credentials. Please try again.';
      toast.error(message);
      throw error;
    }
  };

  const logout = async () => {
    // Preserve the device fingerprint so the same device doc is reused on next login.
    // Clearing it would cause a new fingerprint (and a new pending device entry) every session.
    const savedFingerprint = localStorage.getItem('_jz_fp_id');
    await signOut(auth);
    setUser(null);
    setIsAdminUnlocked(false);
    setDeviceStatus('checking');
    localStorage.clear();
    sessionStorage.clear();
    if (savedFingerprint) localStorage.setItem('_jz_fp_id', savedFingerprint);
    toast.info('Logged out successfully');
  };

  const unlockAdmin = async () => {
    toast.error('The manual PIN system has been retired. Access is managed via Staff Roles.');
    return false;
  };

  const lockAdmin = () => {
    toast.info('Access is permanently managed by your staff role.');
  };

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
        user,
        login,
        logout,
        isAdminUnlocked,
        unlockAdmin,
        lockAdmin,
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
