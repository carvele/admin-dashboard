import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../layouts/DashboardLayout';
import PendingDeviceView from '../components/PendingDeviceView';

// ── Lazy-loaded pages (code-split for faster initial load) ──
const Login = lazy(() => import('../pages/auth/Login'));
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'));
const SetPassword = lazy(() => import('../pages/auth/SetPassword'));
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const Reservations = lazy(() => import('../pages/customers/Reservations'));
const Customers = lazy(() => import('../pages/customers/Customers'));
const Messages = lazy(() => import('../pages/messaging/Messages'));
const DigitalWardrobe = lazy(() => import('../pages/wardrobe/DigitalWardrobe'));
const ClothingCatalog = lazy(() => import('../pages/catalog/ClothingCatalog'));
const Reviews = lazy(() => import('../pages/catalog/Reviews'));
const ProductForm = lazy(() => import('../pages/catalog/ProductForm'));
const ARAssets = lazy(() => import('../pages/wardrobe/ARAssets'));
const Inventory = lazy(() => import('../pages/catalog/Inventory'));
const Analytics = lazy(() => import('../pages/admin/Analytics'));
const Announcements = lazy(() => import('../pages/admin/Announcements'));
const Settings = lazy(() => import('../pages/admin/Settings'));
const StaffManagement = lazy(() => import('../pages/admin/StaffManagement'));
const StaffProfile = lazy(() => import('../pages/admin/StaffProfile'));
const ActivityLog = lazy(() => import('../pages/admin/ActivityLog'));
const AccountDeletionRequests = lazy(() => import('../pages/admin/AccountDeletionRequests'));
const DeviceManagement = lazy(() => import('../pages/admin/DeviceManagement'));

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
          <p>We couldn&apos;t verify your device or connect to the server.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '1rem' }}>
            Please check your internet and refresh the page.
          </p>
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>
            Refresh Page
          </button>
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
  const { checkLockout } = useAuth();

  // Run a background lockout check on every route change.
  // This ensures terminated/blocked/archived accounts are signed out
  // even when navigating within an already-active session.
  useEffect(() => {
    checkLockout();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Routes location={location}>
      <Route
        path="/login"
          element={
            <Suspense fallback={<PageLoader />}>
              <Login />
            </Suspense>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <ForgotPassword />
            </Suspense>
          }
        />
        {/* Reached via the Supabase invite-email link. Not wrapped in
            ProtectedRoute — an invited user has a session but no profiles row
            yet, so `user` is null; SetPassword reads the Supabase session
            directly instead. */}
        <Route
          path="/set-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <SetPassword />
            </Suspense>
          }
        />

        {/* Protect the entire dashboard layout behind the device check */}
        <Route
          path="/"
          element={
            <DeviceProtectedRoute>
              <DashboardLayout />
            </DeviceProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route
            path="dashboard"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Dashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="reservations"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Reservations />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="customers"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Customers />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="messages"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Messages />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="wardrobe"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <DigitalWardrobe />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="inventory"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Inventory />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="catalog"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ClothingCatalog />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="reviews"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <Reviews />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Admin / Owner only routes */}
          <Route
            path="catalog/new"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <ProductForm />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="catalog/edit/:id"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <ProductForm />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          {/* Read-only product detail — any authenticated staff can view,
              unlike catalog/new and catalog/edit which are admin-only */}
          <Route
            path="catalog/view/:id"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <ProductForm readOnly />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="ar-assets"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <ARAssets />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="announcements"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <Announcements />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="analytics"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <Analytics />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />

          <Route
            path="staff"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <StaffManagement />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          {/* staff/:id — any authenticated user may visit;
              StaffProfile redirects non-admins who try to view another user's profile */}
          <Route
            path="staff/:id"
            element={
              <ProtectedRoute>
                <Suspense fallback={<PageLoader />}>
                  <StaffProfile />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <Settings />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="activity-log"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <ActivityLog />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          {/* Irreversible action (erases data + revokes login) -- owner/admin
              only, same tier as staff management and system settings. */}
          <Route
            path="account-deletion"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <AccountDeletionRequests />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
          <Route
            path="devices"
            element={
              <ProtectedRoute>
                <RequireAdmin>
                  <Suspense fallback={<PageLoader />}>
                    <DeviceManagement />
                  </Suspense>
                </RequireAdmin>
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
  );
};

export const AppRouter = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AnimatedRoutes />
    </BrowserRouter>
  );
};
