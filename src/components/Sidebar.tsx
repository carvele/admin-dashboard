import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  MessageSquare,
  Shirt,
  Grid,
  Star,
  View,
  PackageSearch,
  BarChart3,
  Settings,
  X,
  AlertTriangle,
  ScrollText,
  UserX,
  Megaphone,
  MonitorSmartphone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
// @ts-ignore
import { useAuth } from '../context/AuthContext';
// @ts-ignore
// @ts-ignore
import { subscribeToCollection } from '../lib/supabaseService';
import { getStockHealth } from '../utils/stockStatus';
import './Sidebar.css';

const ADMIN_ROUTES = ['/ar-assets', '/analytics', '/staff', '/settings', '/activity-log', '/account-deletion', '/announcements', '/devices'];

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const Sidebar = ({ isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) => {
  const { user, isAdminUnlocked } = useAuth();

  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingReservationsCount, setPendingReservationsCount] = useState(0);
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
    let convUnread = 0;
    let msgUnread = 0;

    const updateCount = (cUnread: number, mUnread: number) => {
      setUnreadMessages(Math.max(cUnread, mUnread));
    };

    const unsubConv = subscribeToCollection('conversations', (convs: any[]) => {
      convUnread = convs.reduce(
        (sum: number, conv: any) => sum + (conv.unreadCount || conv.unread_count || conv.unread || 0),
        0,
      );
      updateCount(convUnread, msgUnread);
    });

    const unsubMsgs = subscribeToCollection('messages', (msgs: any[]) => {
      const staffIds = new Set([(user as any)?.uid, (user as any)?.id, (user as any)?.docId].filter(Boolean));
      let count = 0;
      for (const m of msgs) {
        if (m.deleted === true) continue;
        const isRead = Boolean(m.readAt || m.read_at);
        const sender = m.senderId || m.sender_id;
        const isStaff = m.isStaff || m.is_staff || (sender && staffIds.has(sender));
        if (!isRead && !isStaff && sender) {
          count++;
        }
      }
      msgUnread = count;
      updateCount(convUnread, msgUnread);
    });

    return () => {
      unsubConv();
      unsubMsgs();
    };
  }, [user]);

  useEffect(() => {
    const unsub = subscribeToCollection('reservations', (data: any[]) => {
      let count = 0;
      for (const r of data) {
        if (r.deleted === true) continue;
        const status = (r.status || '').trim();
        const rescheduleStatus = (r.rescheduleStatus || r.reschedule_status || '').trim();
        const paymentStatus = (r.paymentStatus || r.payment_status || '').trim();
        if (
          status === 'Pending' ||
          status === 'Request Approval' ||
          status === 'To Pay' ||
          rescheduleStatus === 'requested' ||
          paymentStatus === 'Awaiting Verification'
        ) {
          count++;
        }
      }
      setPendingReservationsCount(count);
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
    { to: '/reviews', icon: Star, label: 'Review Moderation', admin: false },
    { to: '/inventory', icon: PackageSearch, label: 'Inventory', admin: false, alertType: stockAlert },
    {
      to: '/reservations',
      icon: CalendarCheck,
      label: 'Reservations',
      admin: false,
      badge: pendingReservationsCount > 0 ? pendingReservationsCount : null,
      badgeColor: 'gold',
    },
    { to: '/customers', icon: Users, label: 'Customers', admin: false },
    {
      to: '/messages',
      icon: MessageSquare,
      label: 'Messages',
      admin: false,
      badge: unreadMessages > 0 ? unreadMessages : null,
      badgeColor: 'pink',
    },
    { to: '/wardrobe', icon: Shirt, label: 'Digital Wardrobe', admin: false },
    { to: '/ar-assets', icon: View, label: 'AR Try-On Assets', admin: true },
    { to: '/analytics', icon: BarChart3, label: 'Analytics', admin: true },
    { to: '/announcements', icon: Megaphone, label: 'Announcements', admin: true },
    { to: '/staff', icon: Users, label: 'Team Management', admin: true },
    { to: '/activity-log', icon: ScrollText, label: 'Activity Log', admin: true },
    { to: '/account-deletion', icon: UserX, label: 'Account Deletion Requests', admin: true },
    { to: '/devices', icon: MonitorSmartphone, label: 'Device Management', admin: true },
    { to: '/settings', icon: Settings, label: 'System Settings', admin: true },
  ];

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClose?.();
            }
          }}
        />
      )}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''} ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-brand">
          {!isCollapsed ? (
            <div className="brand-text">
              <h2 className="font-serif">JezSy Couture</h2>
              <span className="brand-subtitle accent-pink-text">by Ms. Jholy</span>
            </div>
          ) : (
            <div className="brand-collapsed-logo" title="JezSy Couture">
              <span className="font-serif">JC</span>
            </div>
          )}
          <div className="sidebar-brand-controls">
            {onToggleCollapse && (
              <button
                type="button"
                className="sidebar-collapse-btn desktop-only"
                onClick={onToggleCollapse}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            )}
            <button className="sidebar-close-btn mobile-only" onClick={onClose} aria-label="Close sidebar">
              <X size={20} />
            </button>
          </div>
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
                    title={isCollapsed ? link.label : undefined}
                    data-tooltip={link.label}
                  >
                    <Icon size={20} className="nav-icon" />
                    {!isCollapsed && <span className="nav-label">{link.label}</span>}
                    {link.badge && (
                      <span className={`badge-unread ${(link as any).badgeColor ? `badge-${(link as any).badgeColor}` : ''} ${isCollapsed ? 'collapsed-dot' : ''}`}>
                        {isCollapsed ? '' : link.badge}
                      </span>
                    )}
                    {(link as any).alertType && (
                      <span className={`sidebar-alert-icon ${(link as any).alertType} ${isCollapsed ? 'collapsed' : ''}`}>
                        <AlertTriangle size={isCollapsed ? 12 : 16} strokeWidth={2.5} />
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
            title={(user as any)?.name ? `${(user as any)?.name} (${(user as any)?.role || (isAdminUnlocked ? 'Admin' : 'Staff')})` : 'View my profile'}
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: isCollapsed ? '0' : '10px', justifyContent: isCollapsed ? 'center' : 'flex-start', cursor: 'pointer' }}
          >
            <div className="profile-avatar">
              <span>{(user as any)?.name?.[0]?.toUpperCase() || 'S'}</span>
            </div>
            {!isCollapsed && (
              <div className="profile-info">
                <span className="profile-name">{(user as any)?.name || 'Staff Member'}</span>
                <span
                  className="profile-role"
                  style={{ color: isAdminUnlocked ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  {(user as any)?.role === 'Owner'
                    ? '👑 Owner Access'
                    : (user as any)?.role === 'Admin'
                    ? '🛡️ Admin Access'
                    : '👤 Staff Member'}
                </span>
              </div>
            )}
          </Link>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
