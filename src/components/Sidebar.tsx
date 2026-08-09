import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  MessageSquare,
  MessageSquarePlus,
  Shirt,
  Layers,
  Grid,
  View,
  PackageSearch,
  BarChart3,
  Settings,
  X,
  Shield,
  AlertTriangle,
  ScrollText,
  UserX,
} from 'lucide-react';
// @ts-ignore
import { useAuth } from '../context/AuthContext';
// @ts-ignore
// @ts-ignore
import { subscribeToCollection } from '../lib/supabaseService';
import { getStockHealth } from '../utils/stockStatus';
import './Sidebar.css';

const ADMIN_ROUTES = ['/ar-assets', '/analytics', '/devices', '/staff', '/settings', '/activity-log', '/account-deletion'];

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { user, isAdminUnlocked } = useAuth();

  const [unreadMessages, setUnreadMessages] = useState(0);
  const [stockAlert, setStockAlert] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToCollection('inventory', (data: any[]) => {
      let hasNoStockOrCritical = false;
      let hasVeryLow = false;
      
      for (const item of data) {
        if (item.deleted === true) continue; // Ignore archived items
        
        const total = item.total || 0;
        const available = item.available || 0;
        const reserved = item.reserved || 0;

        const health = getStockHealth(available, total, reserved);
        
        if (health.tier === 'no-stock' || health.tier === 'critical') {
          hasNoStockOrCritical = true;
          break; // Red alert takes priority
        }
        
        if (health.tier === 'very-low') {
          hasVeryLow = true;
        }
      }

      if (hasNoStockOrCritical) {
        setStockAlert('danger');
      } else if (hasVeryLow) {
        setStockAlert('warning');
      } else {
        setStockAlert(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToCollection('conversations', (data: any[]) => {
      const count = data.reduce((sum: number, conv: any) => sum + (conv.unreadCount || conv.unread || 0), 0);
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
    { to: '/inventory', icon: PackageSearch, label: 'Inventory', admin: false, alertType: stockAlert },
    { to: '/reservations', icon: CalendarCheck, label: 'Reservations', admin: false },
    { to: '/customers', icon: Users, label: 'Customers', admin: false },
    { to: '/feedbacks', icon: MessageSquarePlus, label: 'Feedback & Suggestions', admin: false },
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
    { to: '/activity-log', icon: ScrollText, label: 'Activity Log', admin: true },
    { to: '/account-deletion', icon: UserX, label: 'Account Deletion Requests', admin: true },
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
                    {(link as any).alertType && (
                      <span className={`sidebar-alert-icon ${(link as any).alertType}`}>
                        <AlertTriangle size={16} strokeWidth={2.5} />
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <Link
            to={`/staff/${(user as any)?.uid}`}
            className="profile-badge"
            title="View my profile"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <div className="profile-avatar">
              <span>{(user as any)?.name?.[0]?.toUpperCase() || 'S'}</span>
            </div>
            <div className="profile-info">
              <span className="profile-name">{(user as any)?.name || 'Staff Member'}</span>
              <span
                className="profile-role"
                style={{ color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)' }}
              >
                {isAdminUnlocked ? '👑 Owner Access' : '👤 Sales Staff'}
              </span>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
