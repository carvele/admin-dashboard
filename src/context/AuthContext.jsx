import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../firebase/config';
import * as FingerprintJS from '@fingerprintjs/fingerprintjs';
import { registerDevice, getDeviceStatus, rescueDevice, logAction, getStaffByEmail } from '../firebase/firestore';

const AuthContext = createContext(null);

// Utility: Race a promise against a timeout so the app never freezes
const withTimeout = (promise, ms = 5000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
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
      let visitorId = localStorage.getItem('device_fallback_id');
      try {
        const fp = await withTimeout(FingerprintJS.load(), 3000);
        const result = await fp.get();
        visitorId = result.visitorId;
        localStorage.setItem('device_fallback_id', visitorId);
      } catch {
        if (!visitorId) {
          visitorId = 'fb_' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('device_fallback_id', visitorId);
        }
      }
      setDeviceFingerprint(visitorId);

      // --- 2. Register device & start live listener (non-blocking) ---
      try {
        await withTimeout(registerDevice(visitorId, navigator.userAgent), 5000);
        deviceUnsubRef.current();
        deviceUnsubRef.current = getDeviceStatus(visitorId, (docSnap) => {
          if (docSnap) {
            setDeviceData(docSnap);
            setDeviceStatus(docSnap.status);
            if (docSnap.status === 'revoked') setIsAdminUnlocked(false);
          } else {
            setDeviceStatus('error');
          }
        });
      } catch {
        console.warn('Device registration timed out or failed. Continuing without device tracking.');
        setDeviceStatus('approved'); // Graceful fallback: let them in
      }

      // --- 3. Staff role lookup ---
      let resolvedRole = 'Sales Staff';
      let staffName = '';
      try {
        const staffDoc = await withTimeout(getStaffByEmail(firebaseUser.email), 5000);
        if (staffDoc) {
          resolvedRole = staffDoc.role;
          staffName = staffDoc.name;
        } else if (firebaseUser.email === 'admin@jezsy.com' || firebaseUser.email === 'admin@jezsycollection.com') {
          resolvedRole = 'Admin';
        }
      } catch {
        console.warn('Staff role lookup timed out. Using fallback role.');
        if (firebaseUser.email === 'admin@jezsy.com' || firebaseUser.email === 'admin@jezsycollection.com') {
          resolvedRole = 'Admin';
        }
      }

      // --- 4. Set user & admin state ---
      setUser({
        uid: firebaseUser.uid,
        name: staffName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Staff',
        email: firebaseUser.email,
        role: resolvedRole
      });

      setIsAdminUnlocked(resolvedRole === 'Admin' || resolvedRole === 'Owner');

    } catch (err) {
      console.error("Auth check failed:", err);
      setDeviceStatus('error');
    } finally {
      // ★ GUARANTEED: always unblock the UI — no matter what
      setIsLoading(false);
    }
  };

  // Listen for auth state changes (initial load + logout)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, handleDeviceCheck);
    return () => {
      unsubscribe();
      deviceUnsubRef.current();
    };
  }, []);

  // Auto-logout idle timer (30 minutes)
  useEffect(() => {
    let timeoutId;
    
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (user) {
          toast.error("Session expired due to inactivity. Logging out.");
          logout();
        }
      }, 30 * 60 * 1000);
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
      if (error.code === 'auth/invalid-credential') message = 'Invalid credentials. Please try again.';
      toast.error(message);
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setIsAdminUnlocked(false);
    setDeviceStatus('checking');
    toast.info('Logged out successfully');
  };

  const unlockAdmin = async () => {
    toast.error('The manual PIN system has been retired. Access is managed via Staff Roles.');
    return false;
  };

  const lockAdmin = () => {
    toast.info('Access is permanently managed by your staff role.');
  };

  const rescueMyDevice = async () => {
    if (!deviceFingerprint) return;
    try {
      await rescueDevice(deviceFingerprint);
      await logAction(user, 'Stealth device rescue performed', { fingerprint: deviceFingerprint });
      setDeviceStatus('approved');
      setIsAdminUnlocked(true);
      toast.success('Stealth Rescue Successful! Device unbanned.');
    } catch (err) {
      toast.error('Rescue failed.');
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: 'var(--cream)' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
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
      rescueMyDevice
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
