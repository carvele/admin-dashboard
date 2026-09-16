import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import ErrorBoundary from '../components/ErrorBoundary';
import LegalAcceptanceGate from '../components/LegalAcceptanceGate';
import { legalService } from '../services/legalService';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  
  // Legal state
  const [legalStatus, setLegalStatus] = useState(null);
  const [legalError, setLegalError] = useState(null);
  const [isLegalLoading, setIsLegalLoading] = useState(true);

  const location = useLocation();
  const outlet = useOutlet();

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const checkLegalStatus = useCallback(async () => {
    if (!user) return;
    try {
      const status = await legalService.getLegalAcceptanceStatus();
      setLegalStatus(status);
      setLegalError(null);
    } catch (err) {
      setLegalError(err);
    } finally {
      setIsLegalLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkLegalStatus();
  }, [user, checkLegalStatus]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isBlocked = !isLegalLoading && (legalError || (legalStatus?.gate_enabled && !legalStatus?.can_continue));

  return (
    <>
      <div className={`layout-container ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
        />
        <div className="layout-main">
          <TopNav user={user} onHamburger={() => setSidebarOpen(true)} />
          <main className="layout-content">
            <ErrorBoundary resetKey={location.pathname}>
              <AnimatePresence mode="wait">
                {outlet && React.cloneElement(outlet, { key: location.pathname })}
              </AnimatePresence>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {isBlocked && (
        <LegalAcceptanceGate
          status={legalStatus}
          error={legalError}
          onRetry={checkLegalStatus}
          onAccepted={checkLegalStatus}
        />
      )}
    </>
  );
};

export default DashboardLayout;

