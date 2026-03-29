import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, Search, Menu, X, Sun, Moon } from 'lucide-react';
// @ts-ignore
import { getAvatarColor, getInitials, formatRelativeTime, sanitizeForDisplay, } from '../utils/helpers';
// @ts-ignore
import { subscribeToCollection, updateDocument } from '../firebase/firestore';
import './TopNav.css';
const TopNav = ({ user, onHamburger }) => {
    const { logout, isAdminUnlocked } = useAuth();
    const navigate = useNavigate();
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    // ── Global Search State ──
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [reservations, setReservations] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const searchRef = useRef(null);
    const [isDark, setIsDark] = useState(localStorage.getItem('theme') === 'dark');
    const initials = getInitials(user?.name);
    // ── Theme Management ──
    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
        else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDark]);
    // ── Subscribe to data for search ──
    useEffect(() => {
        const unsubR = subscribeToCollection('reservations', setReservations);
        const unsubC = subscribeToCollection('users', (data) => {
            setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
        });
        const unsubP = subscribeToCollection('products', setProducts);
        return () => {
            unsubR();
            unsubC();
            unsubP();
        };
    }, []);
    // ── Subscribe to notifications ──
    useEffect(() => {
        const unsub = subscribeToCollection('notifications', (data) => {
            const sorted = [...data].sort((a, b) => {
                const aTime = a.createdAt?.seconds || 0;
                const bTime = b.createdAt?.seconds || 0;
                return bTime - aTime;
            });
            setNotifications(sorted.slice(0, 10));
            setUnreadCount(sorted.filter((n) => !n.read).length);
        });
        return () => unsub();
    }, []);
    // ── Close search on click outside ──
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSearchResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    // ── Perform search ──
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }
        const q = sanitizeForDisplay(searchQuery).toLowerCase();
        const results = [];
        // Search reservations
        reservations.forEach((r) => {
            const sanitizedCustomer = sanitizeForDisplay(r.customer || '');
            const sanitizedId = sanitizeForDisplay(r.id || '');
            const sanitizedOutfit = sanitizeForDisplay(r.outfit || '');
            if (sanitizedCustomer.toLowerCase().includes(q) ||
                sanitizedId.toLowerCase().includes(q) ||
                sanitizedOutfit.toLowerCase().includes(q)) {
                results.push({
                    type: 'Reservation',
                    label: `${sanitizedId} — ${sanitizedCustomer}`,
                    sub: sanitizedOutfit,
                    path: '/reservations',
                });
            }
        });
        // Search customers
        customers.forEach((c) => {
            const name = sanitizeForDisplay(c.name || c.email || '');
            const sanitizedEmail = sanitizeForDisplay(c.email || '');
            if (name.toLowerCase().includes(q) || sanitizedEmail.toLowerCase().includes(q)) {
                results.push({ type: 'Customer', label: name, sub: sanitizedEmail, path: '/customers' });
            }
        });
        // Search products
        products.forEach((p) => {
            const sanitizedName = sanitizeForDisplay(p.name || '');
            const sanitizedCategory = sanitizeForDisplay(p.category || '');
            const sanitizedPrice = sanitizeForDisplay((p.price || 0).toString());
            if (sanitizedName.toLowerCase().includes(q) || sanitizedCategory.toLowerCase().includes(q)) {
                results.push({
                    type: 'Product',
                    label: sanitizedName,
                    sub: `${sanitizedCategory} · ₱${parseFloat(sanitizedPrice).toLocaleString()}`,
                    path: '/catalog',
                });
            }
        });
        // Quick nav
        const navItems = [
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Reservations', path: '/reservations' },
            { label: 'Customers', path: '/customers' },
            { label: 'Messages', path: '/messages' },
            { label: 'Inventory', path: '/inventory' },
            { label: 'Catalog', path: '/catalog' },
            { label: 'Analytics', path: '/analytics' },
            { label: 'Settings', path: '/settings' },
            { label: 'Staff Management', path: '/staff' },
            { label: 'Device Management', path: '/devices' },
        ];
        navItems.forEach((item) => {
            if (item.label.toLowerCase().includes(q)) {
                results.push({ type: 'Page', label: item.label, sub: 'Navigate', path: item.path });
            }
        });
        setSearchResults(results.slice(0, 8));
        setShowSearchResults(true);
    }, [searchQuery, reservations, customers, products]);
    const handleResultClick = (path) => {
        navigate(path);
        setSearchQuery('');
        setShowSearchResults(false);
    };
    const markAllRead = async () => {
        try {
            const unread = notifications.filter((n) => !n.read);
            for (const n of unread) {
                await updateDocument('notifications', n.docId, { read: true });
            }
        }
        catch (err) {
            console.error('Failed to mark notifications as read:', err);
        }
    };
    const getTypeColor = (type) => {
        switch (type) {
            case 'Reservation':
                return '#8B6F5C';
            case 'Customer':
                return '#6366F1';
            case 'Product':
                return '#10B981';
            case 'Page':
                return '#6B7280';
            default:
                return '#8B6F5C';
        }
    };
    return (_jsxs("header", { className: "topnav", children: [_jsxs("div", { className: "topnav-left", children: [_jsx("button", { className: "hamburger-btn", onClick: onHamburger, "aria-label": "Open menu", children: _jsx(Menu, { size: 22 }) }), _jsxs("div", { className: "topnav-search", ref: searchRef, children: [_jsx(Search, { size: 18, className: "search-icon" }), _jsx("input", { type: "text", placeholder: "Search orders, customers, or items...", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), onFocus: () => searchQuery.trim() && setShowSearchResults(true) }), searchQuery && (_jsx("button", { className: "search-clear-btn", onClick: () => {
                                    setSearchQuery('');
                                    setShowSearchResults(false);
                                }, children: _jsx(X, { size: 14 }) })), showSearchResults && searchResults.length > 0 && (_jsx("div", { className: "search-dropdown card", children: _jsx("div", { className: "search-results-list", children: searchResults.map((result, idx) => (_jsxs("button", { className: "search-result-item", onClick: () => handleResultClick(result.path), children: [_jsx("span", { className: "search-result-type", style: { color: getTypeColor(result.type) }, children: result.type }), _jsxs("div", { className: "search-result-info", children: [_jsx("span", { className: "search-result-label", children: result.label }), _jsx("span", { className: "search-result-sub", children: result.sub })] })] }, idx))) }) })), showSearchResults && searchQuery.trim() && searchResults.length === 0 && (_jsx("div", { className: "search-dropdown card", children: _jsxs("div", { className: "search-no-results", children: ["No results found for \"", sanitizeForDisplay(searchQuery), "\""] }) }))] })] }), _jsxs("div", { className: "topnav-actions", children: [_jsx("button", { className: "icon-btn theme-toggle", onClick: () => setIsDark(!isDark), title: `Switch to ${isDark ? 'Light' : 'Dark'} Mode`, children: [isDark ? _jsx(Sun, { size: 20 }) : _jsx(Moon, { size: 20 })] }), _jsxs("div", { className: "sync-status", title: "Connected to Real-time Database", children: [_jsx("div", { className: "sync-indicator" }), _jsx("span", { className: "sync-text", children: "Live" })] }), _jsxs("div", { className: "notification-wrapper", children: [_jsxs("button", { className: "icon-btn", onClick: () => setShowNotifications(!showNotifications), children: [_jsx(Bell, { size: 20 }), unreadCount > 0 && _jsx("span", { className: "notification-dot", children: unreadCount })] }), showNotifications && (_jsxs("div", { className: "notifications-dropdown card", children: [_jsxs("div", { className: "dropdown-header", children: [_jsx("h3", { children: "Notifications" }), _jsx("button", { className: "text-btn", onClick: markAllRead, children: "Mark all read" })] }), _jsx("ul", { className: "notification-list", children: notifications.length === 0 ? (_jsx("li", { className: "notification-item", children: _jsx("div", { className: "noti-content", style: { textAlign: 'center', width: '100%' }, children: _jsx("p", { className: "text-secondary", children: "No notifications yet" }) }) })) : (notifications.map((n) => (_jsxs("li", { className: `notification-item ${!n.read ? 'unread' : ''}`, children: [_jsx("div", { className: "noti-icon reservation", children: (n.type || 'N')[0].toUpperCase() }), _jsxs("div", { className: "noti-content", children: [_jsx("p", { children: n.message || 'New notification' }), _jsx("span", { children: n.createdAt?.seconds
                                                                ? formatRelativeTime(n.createdAt.seconds * 1000)
                                                                : 'Just now' })] })] }, n.id || n.docId)))) })] }))] }), _jsxs("div", { className: "user-menu", children: [_jsx("div", { className: "avatar", style: { backgroundColor: getAvatarColor(user?.name || 'A') }, children: initials }), _jsxs("div", { className: "user-info", children: [_jsx("span", { className: "user-name", children: user?.name || 'Staff Member' }), _jsx("span", { className: "user-role-top", style: {
                                            fontSize: '0.75rem',
                                            color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)',
                                            fontWeight: 500,
                                        }, children: isAdminUnlocked ? 'Owner (Super Admin)' : 'Sales Staff' })] }), _jsx("button", { className: "icon-btn logout-btn", onClick: logout, title: "Logout", children: _jsx(LogOut, { size: 18 }) })] })] })] }));
};
export default TopNav;
