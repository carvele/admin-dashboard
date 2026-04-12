import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    return (_jsxs("div", { className: "layout-container", children: [_jsx(Sidebar, { isOpen: sidebarOpen, onClose: () => setSidebarOpen(false) }), _jsxs("div", { className: "layout-main", children: [_jsx(TopNav, { user: user, onHamburger: () => setSidebarOpen(true) }), _jsx("main", { className: "layout-content", children: _jsx(AnimatePresence, { mode: "wait", children: outlet && React.cloneElement(outlet, { key: location.pathname }) }) })] })] }));
};
export default DashboardLayout;
