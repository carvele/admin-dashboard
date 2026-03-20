import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, Search, Menu, X } from 'lucide-react';
import { getAvatarColor, getInitials, formatRelativeTime } from '../utils/helpers';
import { subscribeToCollection, addDocument, updateDocument } from '../firebase/firestore';
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

  const initials = getInitials(user?.name);

  // ── Subscribe to data for search ──
  useEffect(() => {
    const unsubR = subscribeToCollection('reservations', setReservations);
    const unsubC = subscribeToCollection('users', (data) => {
      setCustomers(data.filter(u => !u.role || u.role === 'customer'));
    });
    const unsubP = subscribeToCollection('products', setProducts);
    return () => { unsubR(); unsubC(); unsubP(); };
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
      setUnreadCount(sorted.filter(n => !n.read).length);
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

    const q = searchQuery.toLowerCase();
    const results = [];

    // Search reservations
    reservations.forEach(r => {
      if ((r.customer || '').toLowerCase().includes(q) || (r.id || '').toLowerCase().includes(q) || (r.outfit || '').toLowerCase().includes(q)) {
        results.push({ type: 'Reservation', label: `${r.id} — ${r.customer}`, sub: r.outfit, path: '/reservations' });
      }
    });

    // Search customers
    customers.forEach(c => {
      const name = c.name || c.email || '';
      if (name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)) {
        results.push({ type: 'Customer', label: name, sub: c.email, path: '/customers' });
      }
    });

    // Search products
    products.forEach(p => {
      if ((p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)) {
        results.push({ type: 'Product', label: p.name, sub: `${p.category} · ₱${(p.price || 0).toLocaleString()}`, path: '/catalog' });
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
    navItems.forEach(item => {
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
      const unread = notifications.filter(n => !n.read);
      for (const n of unread) {
        await updateDocument('notifications', n.docId, { read: true });
      }
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Reservation': return '#8B6F5C';
      case 'Customer': return '#6366F1';
      case 'Product': return '#10B981';
      case 'Page': return '#6B7280';
      default: return '#8B6F5C';
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
            <button className="search-clear-btn" onClick={() => { setSearchQuery(''); setShowSearchResults(false); }}>
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
                    <span className="search-result-type" style={{ color: getTypeColor(result.type) }}>
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
              <div className="search-no-results">No results found for "{searchQuery}"</div>
            </div>
          )}
        </div>
      </div>
      <div className="topnav-actions">
        <div className="notification-wrapper">
          <button 
            className="icon-btn" 
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={20} />
            {unreadCount > 0 && <span className="notification-dot">{unreadCount}</span>}
          </button>
          
          {showNotifications && (
            <div className="notifications-dropdown card">
              <div className="dropdown-header">
                <h3>Notifications</h3>
                <button className="text-btn" onClick={markAllRead}>Mark all read</button>
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
                    <li key={n.id || n.docId} className={`notification-item ${!n.read ? 'unread' : ''}`}>
                      <div className="noti-icon reservation">{(n.type || 'N')[0].toUpperCase()}</div>
                      <div className="noti-content">
                        <p>{n.message || 'New notification'}</p>
                        <span>{n.createdAt?.seconds ? formatRelativeTime(n.createdAt.seconds * 1000) : 'Just now'}</span>
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
            style={{ backgroundColor: getAvatarColor(user?.name || 'A') }}
          >
            {initials}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'Staff Member'}</span>
            <span className="user-role-top" style={{ fontSize: '0.75rem', color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 500 }}>
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
