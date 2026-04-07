import React, { useState } from 'react';
import { Navigate, useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const outlet = useOutlet();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="layout-container">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="layout-main">
        <TopNav user={user} onHamburger={() => setSidebarOpen(true)} />
        <main className="layout-content">
          <AnimatePresence mode="wait">
            {outlet && React.cloneElement(outlet, { key: location.pathname })}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
