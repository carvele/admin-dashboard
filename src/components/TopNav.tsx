import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Bell, LogOut, Search, Menu, X, Sun, Moon } from 'lucide-react';
import {
  getAvatarColor,
  getInitials,
  formatRelativeTime,
  sanitizeForDisplay,
} from '../utils/helpers';
import { subscribeToCollection, updateDocument } from '../lib/supabaseService';
import './TopNav.css';
import { User } from '../types';

interface TopNavProps {
  user?: User | null;
  onHamburger: () => void;
}

const getDisplayRole = (role?: string) => {
  if (!role) return 'Staff';
  const r = (role || '').toLowerCase().trim();
  if (r === 'owner') return 'Owner';
  if (r === 'staff') return 'Staff';
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const TopNav = ({ user, onHamburger }: TopNavProps) => {
  const { logout } = useAuth() as any;
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Refs for click-outside detection ──
  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // ── Global Search State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const initials = getInitials((user as any)?.name);

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
        const { getCollection } = await import('../lib/supabaseService');
        const q = sanitizeForDisplay(searchQuery).toLowerCase();
        const results: any[] = [];

        // Fetch limited sets for local search
        const resSearch = await getCollection('reservations', true, 50);
        const custSearch = await getCollection('profiles', false, 50);
        const prodSearch = await getCollection('products', false, 50);

        resSearch.forEach((r: any) => {
          const sCustomer = (r.customerName || r.customer || '').toLowerCase();
          if (sCustomer.includes(q) || (r.id && r.id.toLowerCase().includes(q))) {
            results.push({
              type: 'Reservation',
              label: `${r.id} — ${r.customerName || r.customer}`,
              sub: r.productName || r.outfit || 'Order',  // prefer canonical `productName`
              path: '/reservations',
            });
          }
        });

        custSearch.forEach((c: any) => {
          const cName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || '';
          if (cName.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)) {
            results.push({ type: 'Customer', label: cName, sub: c.email, path: '/customers' });
          }
        });

        // Search products
        prodSearch.forEach((p: any) => {
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
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // ── Subscribe to notifications (Limited to 20 recent) ──
  // Handles both web-created docs (createdAt: Timestamp) and
  // Android-created docs (timestamp: epoch-ms long).
  useEffect(() => {
    const unsub = subscribeToCollection(
      'notifications',
      (data: any[]) => {
        // Sort by ISO createdAt string descending
        const sorted = [...data].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : (a.timestamp || 0);
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : (b.timestamp || 0);
          return bTime - aTime;
        }).slice(0, 20);
        setNotifications(sorted);
        setUnreadCount(sorted.filter((n) => !n.isRead).length);
      },
    );
    return () => unsub();
  }, []);

  // ── Close popovers on click outside ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = (path: string) => {
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
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  };

  const getTypeColor = (type: string) => {
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

  return (
    <header className="topnav">
      <div className="topnav-left">
        <button className="hamburger-btn" onClick={onHamburger} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <div className="topnav-search" ref={searchRef}>
          <Search size={18} className="search-icon" />
          <input
            id="global-search-input"
            name="globalSearch"
            type="text"
            placeholder="Search orders, customers, or items..."
            aria-label="Search orders, customers, or items"
            autoComplete="off"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
          />
          {searchQuery && (
            <button
              className="search-clear-btn"
              onClick={() => {
                setSearchQuery('');
                setShowSearchResults(false);
              }}
            >
              <X size={14} />
            </button>
          )}

          {showSearchResults && searchResults.length > 0 && (
            <div className="search-dropdown card">
              <div className="search-results-list">
                {searchResults.map((result, idx) => (
                  <button
                    key={`${result.type}-${result.path}-${idx}`}
                    className="search-result-item"
                    onClick={() => handleResultClick(result.path)}
                  >
                    <span
                      className="search-result-type"
                      style={{ color: getTypeColor(result.type) }}
                    >
                      {result.type}
                    </span>
                    <div className="search-result-info">
                      <span className="search-result-label">{result.label}</span>
                      <span className="search-result-sub">{result.sub}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showSearchResults && searchQuery.trim() && searchResults.length === 0 && (
            <div className="search-dropdown card">
              <div className="search-no-results">
                No results found for &quot;{sanitizeForDisplay(searchQuery)}&quot;
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="topnav-actions">
        {/* ── Database Sync Status ── */}
        <div className="sync-status" title="Connected to Real-time Database">
          <div className="sync-indicator"></div>
          <span className="sync-text">Live</span>
        </div>

        <button
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <div className="notification-wrapper" ref={notificationRef}>
          <button
            className="icon-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Toggle notifications"
            aria-expanded={showNotifications}
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className="notification-dot">{unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="notifications-dropdown card">
              <div className="dropdown-header">
                <h3>Notifications</h3>
                <button className="text-btn" onClick={markAllRead}>
                  Mark all read
                </button>
              </div>
              <ul className="notification-list">
                {notifications.length === 0 ? (
                  <li className="notification-item">
                    <div className="noti-content" style={{ textAlign: 'center', width: '100%' }}>
                      <p className="text-secondary">No notifications yet</p>
                    </div>
                  </li>
                ) : (
                  notifications.map((n, idx) => (
                    <li
                      key={n.id || n.docId || `notification-${idx}`}
                      className={`notification-item ${!n.isRead ? 'unread' : ''}`}
                    >
                      <div className="noti-icon reservation">
                        {(n.type || 'N')[0].toUpperCase()}
                      </div>
                      <div className="noti-content">
                        <p>{n.title ? <strong>{n.title}:</strong> : null} {n.message || 'New notification'}</p>
                        <span>
                          {n.createdAt
                            ? formatRelativeTime(new Date(n.createdAt).getTime())
                            : n.timestamp
                            ? formatRelativeTime(n.timestamp)
                            : 'Just now'}
                        </span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="user-menu-wrapper" ref={userMenuRef} style={{ position: 'relative' }}>
          <button 
            className="user-menu-btn" 
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            aria-expanded={showUserDropdown}
            aria-haspopup="true"
          >
            <div
              className="avatar"
              style={{ backgroundColor: getAvatarColor((user as any)?.name || 'A') }}
            >
              {initials}
            </div>
            <div className="user-info">
              <span className="user-name">{(user as any)?.name || 'Staff Member'}</span>
              <span
                className="user-role-top"
                style={{
                  fontSize: '0.75rem',
                  color: (user as any)?.role === 'owner' ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: 500,
                }}
              >
                {getDisplayRole((user as any)?.role)}
              </span>
            </div>
          </button>

          {showUserDropdown && (
            <div className="user-dropdown card">
              <div className="user-dropdown-header">
                <div className="avatar" style={{ backgroundColor: getAvatarColor((user as any)?.name || 'A') }}>
                  {initials}
                </div>
                <div className="user-info">
                  <span className="user-name">{(user as any)?.name || 'Staff Member'}</span>
                  <span className="user-role-top">
                    {getDisplayRole((user as any)?.role)}
                  </span>
                </div>
              </div>
              <div className="user-dropdown-actions">
                <button className="user-dropdown-item destructive" onClick={() => {
                  setShowUserDropdown(false);
                  logout();
                }}>
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopNav;
