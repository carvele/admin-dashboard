import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CalendarCheck, Users, MessageSquare, Shirt, Layers, Grid, View, PackageSearch, BarChart3, Settings, X, Shield, } from 'lucide-react';
// @ts-ignore
import { useAuth } from '../context/AuthContext';
// @ts-ignore
import { subscribeToCollection } from '../firebase/firestore';
import './Sidebar.css';
const ADMIN_ROUTES = ['/ar-assets', '/analytics', '/devices', '/staff', '/settings'];
const Sidebar = ({ isOpen, onClose }) => {
    const { user, isAdminUnlocked } = useAuth();
    const [unreadMessages, setUnreadMessages] = useState(0);
    useEffect(() => {
        const unsub = subscribeToCollection('conversations', (data) => {
            const count = data.reduce((sum, conv) => sum + (conv.unread || 0), 0);
            setUnreadMessages(count);
        });
        return () => unsub();
    }, []);
    const handleNavClick = (e, to) => {
        const isRestricted = ADMIN_ROUTES.includes(to) && !isAdminUnlocked;
        if (isRestricted) {
            e.preventDefault();
            // Simply block navigation since PIN logic is gone
            return;
        }
        onClose?.();
    };
    const allLinks = [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', admin: false },
        { to: '/catalog', icon: Grid, label: 'Clothing Catalog', admin: false },
        { to: '/inventory', icon: PackageSearch, label: 'Inventory', admin: false },
        { to: '/reservations', icon: CalendarCheck, label: 'Reservations', admin: false },
        { to: '/customers', icon: Users, label: 'Customers', admin: false },
        {
            to: '/messages',
            icon: MessageSquare,
            label: 'Messages',
            admin: false,
            badge: unreadMessages > 0 ? unreadMessages : null,
        },
        { to: '/wardrobe', icon: Shirt, label: 'Digital Wardrobe', admin: false },
        { to: '/outfits', icon: Layers, label: 'Outfit Suggestions', admin: false },
        { to: '/ar-assets', icon: View, label: 'AR Try-On Assets', admin: true },
        { to: '/analytics', icon: BarChart3, label: 'Analytics', admin: true },
        { to: '/devices', icon: Shield, label: 'Device Management', admin: true },
        { to: '/staff', icon: Users, label: 'Team Management', admin: true },
        { to: '/settings', icon: Settings, label: 'System Settings', admin: true },
    ];
    return (_jsxs(_Fragment, { children: [isOpen && _jsx("div", { className: "sidebar-overlay", onClick: onClose }), _jsxs("aside", { className: `sidebar ${isOpen ? 'sidebar-open' : ''}`, children: [_jsxs("div", { className: "sidebar-brand", children: [_jsxs("div", { children: [_jsx("h2", { children: "JezSy Collection" }), _jsx("span", { className: "brand-subtitle", children: "Fashion Management" })] }), _jsx("button", { className: "sidebar-close-btn", onClick: onClose, children: _jsx(X, { size: 20 }) })] }), _jsx("nav", { className: "sidebar-nav", children: _jsx("ul", { className: "nav-list", children: allLinks.map((link, idx) => {
                                const Icon = link.icon;
                                const isRestricted = link.admin && !isAdminUnlocked;
                                // Hide restricted links entirely for non-admins to keep UI clean
                                if (isRestricted)
                                    return null;
                                return (_jsx("li", { children: _jsxs(NavLink, { to: link.to, className: ({ isActive }) => `nav-link ${isActive ? 'active' : ''}`, onClick: (e) => handleNavClick(e, link.to), children: [_jsx(Icon, { size: 20 }), _jsx("span", { children: link.label }), link.badge && _jsx("span", { className: "badge-unread", children: link.badge })] }) }, link.to || idx));
                            }) }) }), _jsx("div", { className: "sidebar-footer", children: _jsxs("div", { className: "profile-badge", children: [_jsx("div", { className: "profile-avatar", children: _jsx("span", { children: user?.name?.[0]?.toUpperCase() || 'S' }) }), _jsxs("div", { className: "profile-info", children: [_jsx("span", { className: "profile-name", children: user?.name || 'Staff Member' }), _jsx("span", { className: "profile-role", style: { color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)' }, children: isAdminUnlocked ? '👑 Owner Access' : '👤 Sales Staff' })] })] }) })] })] }));
};
export default Sidebar;
