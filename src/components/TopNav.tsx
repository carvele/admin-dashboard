import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, Search, Menu, X } from 'lucide-react';
// @ts-ignore
import {
  getAvatarColor,
  getInitials,
  formatRelativeTime,
  sanitizeForDisplay,
} from '../utils/helpers';
// @ts-ignore
import { subscribeToCollection, updateDocument, orderBy, limit } from '../firebase/firestore';
import './TopNav.css';
import { User } from '../types';

interface TopNavProps {
  user?: User | null;
  onHamburger: () => void;
}

const TopNav = ({ user, onHamburger }: TopNavProps) => {
  const { logout, isAdminUnlocked } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Global Search State ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef(null);

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
        const { getCollection } = await import('../firebase/firestore');
        const q = sanitizeForDisplay(searchQuery).toLowerCase();
        const results: any[] = [];

        // Check if we already have data from active page-level listeners (optional optimization)
        // Here we just fetch small chunks to reduce reads
        const resSearch = await getCollection('reservations', false); 
        const custSearch = await getCollection('users', false);
        const prodSearch = await getCollection('products', false);

        resSearch.forEach((r: any) => {
          const sCustomer = (r.customer || r.customerName || '').toLowerCase();
          if (sCustomer.includes(q) || (r.id && r.id.toLowerCase().includes(q))) {
            results.push({
              type: 'Reservation',
              label: `${r.id} — ${r.customer || r.customerName}`,
              sub: r.outfit || r.productName || 'Order',
              path: '/reservations',
            });
          }
        });

        custSearch.forEach((c: any) => {
          if ((c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)) {
            results.push({ type: 'Customer', label: c.name, sub: c.email, path: '/customers' });
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
  useEffect(() => {
    // Only listen to the most recent 20 notifications to save reads
    const unsub = subscribeToCollection(
      'notifications',
      (data: any[]) => {
        const sorted = [...data].sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        setNotifications(sorted);
        setUnreadCount(sorted.filter((n) => !n.read).length);
      },
      [orderBy('createdAt', 'desc'), limit(20)],
    );
    return () => unsub();
  }, []);

  // ── Close search on click outside ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !(searchRef.current as any).contains(e.target)) {
        setShowSearchResults(false);
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
      const unread = notifications.filter((n) => !n.read);
      for (const n of unread) {
        await updateDocument('notifications', n.docId, { read: true });
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
            type="text"
            placeholder="Search orders, customers, or items..."
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
                    key={idx}
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
                No results found for "{sanitizeForDisplay(searchQuery)}"
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

        <div className="notification-wrapper">
          <button className="icon-btn" onClick={() => setShowNotifications(!showNotifications)}>
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
                  notifications.map((n) => (
                    <li
                      key={n.id || n.docId}
                      className={`notification-item ${!n.read ? 'unread' : ''}`}
                    >
                      <div className="noti-icon reservation">
                        {(n.type || 'N')[0].toUpperCase()}
                      </div>
                      <div className="noti-content">
                        <p>{n.message || 'New notification'}</p>
                        <span>
                          {n.createdAt?.seconds
                            ? formatRelativeTime(n.createdAt.seconds * 1000)
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

        <div className="user-menu">
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
                color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              {isAdminUnlocked ? 'Owner (Super Admin)' : 'Sales Staff'}
            </span>
          </div>
          <button className="icon-btn logout-btn" onClick={logout} title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopNav;
