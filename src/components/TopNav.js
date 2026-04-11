import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, Search, Menu, X } from 'lucide-react';
import { getAvatarColor, getInitials, formatRelativeTime, sanitizeForDisplay, } from '../utils/helpers';
import { subscribeToCollection, updateDocument, orderBy, limit } from '../firebase/firestore';
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
    const searchRef = useRef(null);
    const initials = getInitials(user?.name);
    // ── Manage search results on-demand ──
    useEffect(() => {
        const handler = setTimeout(async () => {
            if (!searchQuery.trim()) {
                setSearchResults([]);
                setShowSearchResults(false);
                return;
            }
            // Instead of global subscriptions, we'd ideally search via a callable function or specific indices.
            // Since this is a small-to-md shop, we search once when typing pauses.
            try {
                const { getCollection } = await import('../firebase/firestore');
                const q = sanitizeForDisplay(searchQuery).toLowerCase();
                const results = [];
                // Check if we already have data from active page-level listeners (optional optimization)
                // Here we fetch max 50 documents to reduce reads
                const resSearch = await getCollection('reservations', false, 50);
                const custSearch = await getCollection('users', false, 50);
                const prodSearch = await getCollection('products', false, 50);
                resSearch.forEach((r) => {
                    const sCustomer = (r.customerName || r.customer || '').toLowerCase();
                    if (sCustomer.includes(q) || (r.id && r.id.toLowerCase().includes(q))) {
                        results.push({
                            type: 'Reservation',
                            label: `${r.id} — ${r.customerName || r.customer}`,
                            sub: r.productName || r.outfit || 'Order', // prefer canonical `productName`
                            path: '/reservations',
                        });
                    }
                });
                custSearch.forEach((c) => {
                    if ((c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)) {
                        results.push({ type: 'Customer', label: c.name, sub: c.email, path: '/customers' });
                    }
                });
                // Search products
                prodSearch.forEach((p) => {
                    if ((p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)) {
                        results.push({
                            type: 'Product',
                            label: p.name,
                            sub: `${p.category} · ₱${(p.price || 0).toLocaleString()}`,
                            path: '/catalog',
                        });
                    }
                });
                // Quick nav items
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
                setSearchResults(results.slice(0, 10));
                setShowSearchResults(true);
            }
            catch (err) {
                console.error('Search failed:', err);
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);
    // ── Subscribe to notifications (Limited to 20 recent) ──
    // Handles both web-created docs (createdAt: Timestamp) and
    // Android-created docs (timestamp: epoch-ms long).
    useEffect(() => {
        const unsub = subscribeToCollection('notifications', (data) => {
            const sorted = [...data].sort((a, b) => {
                // Prefer Firestore Timestamp; fall back to Android epoch-ms `timestamp`
                const aTime = a.createdAt?.seconds
                    ? a.createdAt.seconds
                    : (a.timestamp || 0) / 1000;
                const bTime = b.createdAt?.seconds
                    ? b.createdAt.seconds
                    : (b.timestamp || 0) / 1000;
                return bTime - aTime;
            });
            setNotifications(sorted);
            setUnreadCount(sorted.filter((n) => !n.isRead).length);
        }, [orderBy('createdAt', 'desc'), limit(20)]);
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
    const handleResultClick = (path) => {
        navigate(path);
        setSearchQuery('');
        setShowSearchResults(false);
    };
    const markAllRead = async () => {
        try {
            const unread = notifications.filter((n) => !n.isRead);
            for (const n of unread) {
                await updateDocument('notifications', n.docId, { isRead: true });
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
                                }, children: _jsx(X, { size: 14 }) })), showSearchResults && searchResults.length > 0 && (_jsx("div", { className: "search-dropdown card", children: _jsx("div", { className: "search-results-list", children: searchResults.map((result, idx) => (_jsxs("button", { className: "search-result-item", onClick: () => handleResultClick(result.path), children: [_jsx("span", { className: "search-result-type", style: { color: getTypeColor(result.type) }, children: result.type }), _jsxs("div", { className: "search-result-info", children: [_jsx("span", { className: "search-result-label", children: result.label }), _jsx("span", { className: "search-result-sub", children: result.sub })] })] }, `${result.type}-${result.path}-${idx}`))) }) })), showSearchResults && searchQuery.trim() && searchResults.length === 0 && (_jsx("div", { className: "search-dropdown card", children: _jsxs("div", { className: "search-no-results", children: ["No results found for \"", sanitizeForDisplay(searchQuery), "\""] }) }))] })] }), _jsxs("div", { className: "topnav-actions", children: [_jsxs("div", { className: "sync-status", title: "Connected to Real-time Database", children: [_jsx("div", { className: "sync-indicator" }), _jsx("span", { className: "sync-text", children: "Live" })] }), _jsxs("div", { className: "notification-wrapper", children: [_jsxs("button", { className: "icon-btn", onClick: () => setShowNotifications(!showNotifications), children: [_jsx(Bell, { size: 20 }), unreadCount > 0 && _jsx("span", { className: "notification-dot", children: unreadCount })] }), showNotifications && (_jsxs("div", { className: "notifications-dropdown card", children: [_jsxs("div", { className: "dropdown-header", children: [_jsx("h3", { children: "Notifications" }), _jsx("button", { className: "text-btn", onClick: markAllRead, children: "Mark all read" })] }), _jsx("ul", { className: "notification-list", children: notifications.length === 0 ? (_jsx("li", { className: "notification-item", children: _jsx("div", { className: "noti-content", style: { textAlign: 'center', width: '100%' }, children: _jsx("p", { className: "text-secondary", children: "No notifications yet" }) }) })) : (notifications.map((n, idx) => (_jsxs("li", { className: `notification-item ${!n.isRead ? 'unread' : ''}`, children: [_jsx("div", { className: "noti-icon reservation", children: (n.type || 'N')[0].toUpperCase() }), _jsxs("div", { className: "noti-content", children: [_jsxs("p", { children: [n.title ? _jsxs("strong", { children: [n.title, ":"] }) : null, " ", n.message || 'New notification'] }), _jsx("span", { children: n.createdAt?.seconds
                                                                ? formatRelativeTime(n.createdAt.seconds * 1000)
                                                                : n.timestamp
                                                                    ? formatRelativeTime(n.timestamp) // Android epoch-ms fallback
                                                                    : 'Just now' })] })] }, n.id || n.docId || `notification-${idx}`)))) })] }))] }), _jsxs("div", { className: "user-menu", children: [_jsx("div", { className: "avatar", style: { backgroundColor: getAvatarColor(user?.name || 'A') }, children: initials }), _jsxs("div", { className: "user-info", children: [_jsx("span", { className: "user-name", children: user?.name || 'Staff Member' }), _jsx("span", { className: "user-role-top", style: {
                                            fontSize: '0.75rem',
                                            color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)',
                                            fontWeight: 500,
                                        }, children: isAdminUnlocked ? 'Owner (Super Admin)' : 'Sales Staff' })] }), _jsx("button", { className: "icon-btn logout-btn", onClick: logout, title: "Logout", children: _jsx(LogOut, { size: 18 }) })] })] })] }));
};
export default TopNav;
