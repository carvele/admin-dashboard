import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  MessageSquare,
  Shirt,
  Layers,
  Grid,
  View,
  PackageSearch,
  BarChart3,
  Settings,
  X,
  Shield,
} from 'lucide-react';
// @ts-ignore
import { useAuth } from '../context/AuthContext';
// @ts-ignore
import { subscribeToCollection } from '../firebase/firestore';
import './Sidebar.css';

const ADMIN_ROUTES = ['/ar-assets', '/analytics', '/devices', '/staff', '/settings'];

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { user, isAdminUnlocked } = useAuth();

  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    const unsub = subscribeToCollection('conversations', (data: any[]) => {
      const count = data.reduce((sum: number, conv: any) => sum + (conv.unread || 0), 0);
      setUnreadMessages(count);
    });
    return () => unsub();
  }, []);

  const handleNavClick = (e: React.MouseEvent, to: string) => {
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

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div>
            <h2>JezSy Collection</h2>
            <span className="brand-subtitle">Fashion Management</span>
          </div>
          <button className="sidebar-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-list">
            {allLinks.map((link, idx) => {
              const Icon = link.icon;
              const isRestricted = link.admin && !isAdminUnlocked;

              // Hide restricted links entirely for non-admins to keep UI clean
              if (isRestricted) return null;

              return (
                <li key={link.to || idx}>
                  <NavLink
                    to={link.to}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    onClick={(e) => handleNavClick(e, link.to)}
                  >
                    <Icon size={20} />
                    <span>{link.label}</span>
                    {link.badge && <span className="badge-unread">{link.badge}</span>}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="profile-badge">
            <div className="profile-avatar">
              <span>{user?.name?.[0]?.toUpperCase() || 'S'}</span>
            </div>
            <div className="profile-info">
              <span className="profile-name">{user?.name || 'Staff Member'}</span>
              <span
                className="profile-role"
                style={{ color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)' }}
              >
                {isAdminUnlocked ? '👑 Owner Access' : '👤 Sales Staff'}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
