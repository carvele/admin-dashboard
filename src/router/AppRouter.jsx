import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../layouts/DashboardLayout';
import PendingDeviceView from '../components/PendingDeviceView';

// ── Lazy-loaded pages (code-split for faster initial load) ──
const Login = lazy(() => import('../pages/auth/Login'));
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const Reservations = lazy(() => import('../pages/customers/Reservations'));
const Customers = lazy(() => import('../pages/customers/Customers'));
const Messages = lazy(() => import('../pages/messaging/Messages'));
const DigitalWardrobe = lazy(() => import('../pages/wardrobe/DigitalWardrobe'));
const OutfitSuggestions = lazy(() => import('../pages/wardrobe/OutfitSuggestions'));
const ClothingCatalog = lazy(() => import('../pages/catalog/ClothingCatalog'));
const ProductForm = lazy(() => import('../pages/catalog/ProductForm'));
const ARAssets = lazy(() => import('../pages/wardrobe/ARAssets'));
const Inventory = lazy(() => import('../pages/catalog/Inventory'));
const Analytics = lazy(() => import('../pages/admin/Analytics'));
const DeviceManagement = lazy(() => import('../pages/admin/DeviceManagement'));
const Settings = lazy(() => import('../pages/admin/Settings'));
const StaffManagement = lazy(() => import('../pages/admin/StaffManagement'));

// Suspense fallback
const PageLoader = () => (
  <div className="flex-center-vh" style={{ minHeight: '300px' }}>
    <div className="loading-spinner"></div>
  </div>
);

// AnimatedPage wrapper
const AnimatedPage = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -15 }}
    transition={{ duration: 0.3, ease: 'easeOut' }}
    className="page-animate"
  >
    {children}
  </motion.div>
);

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <AnimatedPage>{children}</AnimatedPage>;
};

// Wrapper for the entire layout: ensures the device is approved OR bypassed by owner
const DeviceProtectedRoute = ({ children }) => {
  const { user, deviceStatus, isAdminUnlocked } = useAuth();
  
  // If not logged in at all, go to login
  if (!user) return <Navigate to="/login" replace />;
  
  // If we are checking the fingerprint, just show a loading state
  if (deviceStatus === 'checking') {
    return (
      <div className="flex-center-vh">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  // If there was an error with fingerprinting/loading
  if (deviceStatus === 'error') {
    return (
      <div className="flex-center-vh">
        <div className="card text-center" style={{ maxWidth: '400px' }}>
          <h2 style={{ color: 'var(--stock-low)', marginBottom: '1rem' }}>Connection Issue</h2>
          <p>We couldn't verify your device or connect to the server.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '1rem' }}>Please check your internet and refresh the page.</p>
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>Refresh Page</button>
        </div>
      </div>
    );
  }

  // If approved OR the owner unlocked the bypass with their role, let them in
  if (deviceStatus === 'approved' || isAdminUnlocked) {
    return children;
  }

  // Otherwise, they are logged in but their device is pending/revoked
  return <PendingDeviceView />;
};

const RequireAdmin = ({ children }) => {
  const { isAdminUnlocked } = useAuth();
  if (!isAdminUnlocked) return <Navigate to="/dashboard" replace />;
  return children;
};

const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />

        {/* Protect the entire dashboard layout behind the device check */}
        <Route path="/" element={<DeviceProtectedRoute><DashboardLayout /></DeviceProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="dashboard" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></ProtectedRoute>} />
          <Route path="reservations" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Reservations /></Suspense></ProtectedRoute>} />
          <Route path="customers" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Customers /></Suspense></ProtectedRoute>} />
          <Route path="messages" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Messages /></Suspense></ProtectedRoute>} />
          <Route path="wardrobe" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><DigitalWardrobe /></Suspense></ProtectedRoute>} />
          <Route path="outfits" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><OutfitSuggestions /></Suspense></ProtectedRoute>} />
          <Route path="inventory" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><Inventory /></Suspense></ProtectedRoute>} />
          <Route path="catalog" element={<ProtectedRoute><Suspense fallback={<PageLoader />}><ClothingCatalog /></Suspense></ProtectedRoute>} />
          
          {/* Admin / Owner only routes */}
          <Route path="catalog/new" element={<ProtectedRoute><RequireAdmin><Suspense fallback={<PageLoader />}><ProductForm /></Suspense></RequireAdmin></ProtectedRoute>} />
          <Route path="catalog/edit/:id" element={<ProtectedRoute><RequireAdmin><Suspense fallback={<PageLoader />}><ProductForm /></Suspense></RequireAdmin></ProtectedRoute>} />
          <Route path="ar-assets" element={<ProtectedRoute><RequireAdmin><Suspense fallback={<PageLoader />}><ARAssets /></Suspense></RequireAdmin></ProtectedRoute>} />
          <Route path="analytics" element={<ProtectedRoute><RequireAdmin><Suspense fallback={<PageLoader />}><Analytics /></Suspense></RequireAdmin></ProtectedRoute>} />
          <Route path="devices" element={<ProtectedRoute><RequireAdmin><Suspense fallback={<PageLoader />}><DeviceManagement /></Suspense></RequireAdmin></ProtectedRoute>} />
          <Route path="staff" element={<ProtectedRoute><RequireAdmin><Suspense fallback={<PageLoader />}><StaffManagement /></Suspense></RequireAdmin></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute><RequireAdmin><Suspense fallback={<PageLoader />}><Settings /></Suspense></RequireAdmin></ProtectedRoute>} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
};

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
};
