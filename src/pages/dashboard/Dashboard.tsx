import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import {
  Calendar,
  Users,
  Clock,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  Settings2,
  X,
  MapPin,
  Activity,
  Zap,
  PlusCircle,
  MessageSquare,
  ArrowRight,
  Package,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import {
  getDashboardOperations,
  getTopInventoryAlerts,
  getRecentSignups,
  getRecentDashboardActivity,
  deriveMtdDateRange,
} from '../../services/dashboardService';
import {
  getInventoryHealthAnalytics,
  getAnalyticsOverview,
} from '../../services/analyticsService';
import { getUserDisplayName } from '../../utils/helpers';
import { formatLogSentence, relativeTime } from '../../utils/activityLogFormat';
import { motion } from 'framer-motion';
import './Dashboard.css';

const defaultPreferences = {
  statActionRequired: true,
  statPreparing: true,
  statReadyForPickup: true,
  statPendingRefunds: true,
  widgetTodaySchedule: true,
  widgetBusinessSnapshot: true,
  widgetInventoryAttention: true,
  widgetRecentSignups: true,
  widgetRecentActivity: true,
};

interface DomainState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
}

const initialDomainState = <T,>(): DomainState<T> => ({
  data: null,
  loading: true,
  error: null,
  lastUpdated: null,
});

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, isAdminUnlocked } = useAuth() as { user: any; isAdminUnlocked: boolean };
  const canCustomize = can(user?.role, 'customize_dashboard');

  // Preferences
  const [widgetPrefs, setWidgetPrefs] = useState(() => {
    const saved = localStorage.getItem('dashboard_widget_prefs_v2');
    return saved ? JSON.parse(saved) : defaultPreferences;
  });
  const [showPreferences, setShowPreferences] = useState(false);

  const togglePref = (key: keyof typeof defaultPreferences) => {
    const nextPrefs = { ...widgetPrefs, [key]: !widgetPrefs[key] };
    setWidgetPrefs(nextPrefs);
    localStorage.setItem('dashboard_widget_prefs_v2', JSON.stringify(nextPrefs));
  };

  // ── Four Bounded Data Domains ───────────────────────────────────────────
  // Domain 1: Operations (Action queues, refunds, today's schedule)
  const [operations, setOperations] = useState<DomainState<any>>(initialDomainState);
  // Domain 2: Inventory Attention (Aggregate counts & top 5 alerts)
  const [inventory, setInventory] = useState<DomainState<{ health: any; alerts: any[] }>>(initialDomainState);
  // Domain 3: Business Snapshot (Month-to-date canonical overview)
  const [snapshot, setSnapshot] = useState<DomainState<any>>(initialDomainState);
  // Domain 4: Customer Pulse & Activity (Recent signups & allowlisted logs)
  const [activityDomain, setActivityDomain] = useState<DomainState<{ signups: any[]; logs: any[] }>>(initialDomainState);

  // ── Load Operations Domain ──────────────────────────────────────────────
  const loadOperations = useCallback(async () => {
    setOperations((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await getDashboardOperations();
      setOperations({
        data,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });
      return data;
    } catch (err: any) {
      console.error('[Dashboard] loadOperations failed:', err);
      setOperations((prev) => ({
        ...prev,
        loading: false,
        error: err,
        lastUpdated: new Date(),
      }));
      return null;
    }
  }, []);

  // ── Load Inventory Domain ───────────────────────────────────────────────
  const loadInventory = useCallback(async () => {
    setInventory((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [health, alerts] = await Promise.all([
        getInventoryHealthAnalytics(),
        getTopInventoryAlerts(5),
      ]);
      setInventory({
        data: { health, alerts },
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });
    } catch (err: any) {
      console.error('[Dashboard] loadInventory failed:', err);
      setInventory((prev) => ({
        ...prev,
        loading: false,
        error: err,
        lastUpdated: new Date(),
      }));
    }
  }, []);

  // ── Load Business Snapshot Domain (MTD) ──────────────────────────────────
  const loadSnapshot = useCallback(async (businessDateStr: string) => {
    setSnapshot((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const mtd = deriveMtdDateRange(businessDateStr || new Date().toISOString().slice(0, 10));
      const overview = await getAnalyticsOverview(mtd.startDateStr, mtd.endDateStr, mtd.timezone);
      setSnapshot({
        data: overview,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });
    } catch (err: any) {
      console.error('[Dashboard] loadSnapshot failed:', err);
      setSnapshot((prev) => ({
        ...prev,
        loading: false,
        error: err,
        lastUpdated: new Date(),
      }));
    }
  }, []);

  // ── Load Customer & Activity Domain ─────────────────────────────────────
  const loadActivityDomain = useCallback(async () => {
    setActivityDomain((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [signups, logs] = await Promise.all([
        getRecentSignups(5),
        getRecentDashboardActivity(8),
      ]);
      setActivityDomain({
        data: { signups, logs },
        loading: false,
        error: null,
        lastUpdated: new Date(),
      });
    } catch (err: any) {
      console.error('[Dashboard] loadActivityDomain failed:', err);
      setActivityDomain((prev) => ({
        ...prev,
        loading: false,
        error: err,
        lastUpdated: new Date(),
      }));
    }
  }, []);

  // ── Master Loader ────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const opsData = await loadOperations();
    loadInventory();
    loadActivityDomain();
    if (opsData?.business_date) {
      loadSnapshot(opsData.business_date);
    } else {
      const todayInManila = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      loadSnapshot(todayInManila);
    }
  }, [loadOperations, loadInventory, loadActivityDomain, loadSnapshot]);

  useEffect(() => {
    loadAll();
    const intervalId = setInterval(loadAll, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [loadAll]);

  // Real-time synchronization
  useRealtimeSync(loadAll);

  // Motion variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } as any },
  };

  const opsData = operations.data;
  const actionQueues = opsData?.action_queues;
  const refundLiability = opsData?.pending_refund_liability;
  const todaySchedule = opsData?.today_schedule || [];
  const invHealth = inventory.data?.health;
  const invAlerts = inventory.data?.alerts || [];
  const mtdOverview = snapshot.data;
  const recentSignups = activityDomain.data?.signups || [];
  const recentLogs = activityDomain.data?.logs || [];

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Operational Mission Control"
        subtitle="Live boutique operations, queue attention, and daily logistics in Asia/Manila."
        category="OVERVIEW"
        actions={
          <div className="system-health flex-center gap-3">
            <div
              className="health-indicator flex-center gap-1 text-success text-sm font-medium px-3 py-1 rounded-full"
              style={{ backgroundColor: 'var(--status-completed-bg)' }}
            >
              <CheckCircle2 size={16} /> Operations Active
            </div>
            <div className="sync-status flex-center gap-1 text-secondary text-xs">
              Manila Date: {opsData?.business_date || 'Today'}
            </div>
            <button className="btn-outline small flex-center gap-1 ml-2" onClick={loadAll}>
              <RefreshCw size={14} className={operations.loading ? 'animate-spin' : ''} /> Refresh
            </button>
            {canCustomize && (
              <button className="btn-outline small flex-center gap-1 ml-2" onClick={() => setShowPreferences(true)}>
                <Settings2 size={14} /> Customize
              </button>
            )}
          </div>
        }
      />

      {/* QUICK ACTIONS BAR */}
      <motion.div
        className="quick-actions-bar card flex-between align-center px-6 py-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ borderRadius: 'var(--spacing-lg)', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--glass-border)' }}
      >
        <div className="flex align-center gap-3">
          <Zap size={20} className="text-accent" />
          <span className="font-medium">Quick Actions</span>
        </div>
        <div className="flex gap-4">
          {can(user?.role, 'create_reservation') && (
            <button className="btn-primary small flex-center gap-2" onClick={() => navigate('/reservations')}>
              <PlusCircle size={16} /> New Reservation
            </button>
          )}
          {can(user?.role, 'create_catalog') && (
            <button className="btn-outline small flex-center gap-2" onClick={() => navigate('/catalog/new')}>
              <PlusCircle size={16} /> Add Product
            </button>
          )}
          {isAdminUnlocked && (
            <button className="btn-outline small flex-center gap-2" onClick={() => navigate('/announcements')}>
              <MessageSquare size={16} /> Broadcast
            </button>
          )}
        </div>
      </motion.div>

      {/* TOP OPERATIONAL KPI ROW */}
      <motion.div
        className="stats-grid"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* KPI 1: Action Required */}
        {widgetPrefs.statActionRequired && (
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -4 }}
            className="stat-card stat-card-clickable"
            role="button"
            tabIndex={0}
            aria-label="View actionable reservations"
            onClick={() => navigate('/reservations')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/reservations')}
          >
            <div className="stat-icon clock">
              <Clock size={24} />
            </div>
            <div className="stat-info">
              <p className="stat-label font-semibold">Action Required</p>
              {operations.loading ? (
                <div className="stat-value text-secondary text-base">Loading...</div>
              ) : operations.error ? (
                <div className="text-xs text-danger flex align-center gap-1">
                  <span>Unavailable</span>
                  <button className="underline ml-1" onClick={(e) => { e.stopPropagation(); loadOperations(); }}>Retry</button>
                </div>
              ) : (
                <>
                  <h3 className="stat-value">{actionQueues?.unique_action_count ?? 0}</h3>
                  <div className="text-xs text-secondary mt-1">
                    {(actionQueues?.unique_action_count || 0) > 0 ? (
                      <span>
                        {actionQueues?.preparing > 0 && `${actionQueues.preparing} Prep `}
                        {actionQueues?.refund_required > 0 && `· ${actionQueues.refund_required} Refund `}
                        {actionQueues?.awaiting_payment > 0 && `· ${actionQueues.awaiting_payment} To Pay `}
                        {actionQueues?.receipt_review > 0 && `· ${actionQueues.receipt_review} Receipt `}
                        {actionQueues?.ready_for_pickup > 0 && `· ${actionQueues.ready_for_pickup} Pickup `}
                      </span>
                    ) : (
                      <span className="text-success font-medium">All caught up</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* KPI 2: Preparing */}
        {widgetPrefs.statPreparing && (
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -4 }}
            className="stat-card stat-card-clickable"
            role="button"
            tabIndex={0}
            aria-label="View preparing reservations"
            onClick={() => navigate('/reservations?status=Preparing')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/reservations?status=Preparing')}
          >
            <div className="stat-icon calendar">
              <Package size={24} />
            </div>
            <div className="stat-info">
              <p className="stat-label font-semibold">In Preparation</p>
              {operations.loading ? (
                <div className="stat-value text-secondary text-base">Loading...</div>
              ) : operations.error ? (
                <div className="text-xs text-danger">Unavailable</div>
              ) : (
                <>
                  <h3 className="stat-value">{actionQueues?.preparing ?? 0}</h3>
                  <span className="stat-trend neutral">Garments being prepped / fitted</span>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* KPI 3: Ready for Pickup */}
        {widgetPrefs.statReadyForPickup && (
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -4 }}
            className="stat-card stat-card-clickable"
            role="button"
            tabIndex={0}
            aria-label="View ready for pickup reservations"
            onClick={() => navigate('/reservations?status=To%20Pickup')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/reservations?status=To%20Pickup')}
          >
            <div className="stat-icon users">
              <MapPin size={24} />
            </div>
            <div className="stat-info">
              <p className="stat-label font-semibold">Ready for Pickup</p>
              {operations.loading ? (
                <div className="stat-value text-secondary text-base">Loading...</div>
              ) : operations.error ? (
                <div className="text-xs text-danger">Unavailable</div>
              ) : (
                <>
                  <h3 className="stat-value">{actionQueues?.ready_for_pickup ?? 0}</h3>
                  <span className="stat-trend neutral">Packaged & awaiting collection</span>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* KPI 4: Pending Refund Liability */}
        {widgetPrefs.statPendingRefunds && (
          <motion.div
            variants={itemVariants}
            whileHover={{ y: -4 }}
            className={`stat-card stat-card-clickable ${(refundLiability?.amount || 0) > 0 ? 'border-red-200 bg-red-50/40 dark:bg-red-950/20' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="View cancelled reservations requiring refund"
            onClick={() => navigate('/reservations?status=Cancelled')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate('/reservations?status=Cancelled')}
          >
            <div className={`stat-icon ${(refundLiability?.amount || 0) > 0 ? 'text-danger' : 'text-secondary'}`} style={{ backgroundColor: (refundLiability?.amount || 0) > 0 ? 'var(--status-cancelled-bg)' : 'var(--bg-card)' }}>
              <AlertCircle size={24} />
            </div>
            <div className="stat-info">
              <p className="stat-label font-semibold">Pending Refund Liability</p>
              {operations.loading ? (
                <div className="stat-value text-secondary text-base">Loading...</div>
              ) : operations.error ? (
                <div className="text-xs text-danger">Unavailable</div>
              ) : (
                <>
                  <h3 className={`stat-value ${(refundLiability?.amount || 0) > 0 ? 'text-danger' : ''}`}>
                    ₱{(refundLiability?.amount || 0).toLocaleString()}
                  </h3>
                  <span className={`stat-trend ${(refundLiability?.amount || 0) > 0 ? 'text-danger font-semibold' : 'positive'}`}>
                    {(refundLiability?.amount || 0) > 0 ? (
                      `⚠ ${refundLiability?.count || 0} booking(s) require refund`
                    ) : (
                      'No pending refunds'
                    )}
                  </span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* TODAY'S OPERATIONS & BUSINESS SNAPSHOT GRID */}
      <div className="analytics-layout mt-6">
        {/* Left: Today's Scheduled Pickups */}
        {widgetPrefs.widgetTodaySchedule && (
          <div className="card">
            <div className="card-header border-none flex-between">
              <div className="flex align-center gap-2">
                <Calendar size={20} className="text-accent" />
                <h3>Today&apos;s Pickups</h3>
              </div>
              <span className="badge accent">Asia/Manila</span>
            </div>

            <div className="p-4 pt-0">
              {operations.loading ? (
                <div className="p-8 text-center text-secondary">
                  <RefreshCw className="animate-spin inline mr-2" size={16} /> Loading today&apos;s schedule...
                </div>
              ) : operations.error ? (
                <div className="p-6 text-center text-danger">
                  <p>Unable to load today&apos;s schedule.</p>
                  <button className="btn-outline small mt-2" onClick={loadOperations}>Retry</button>
                </div>
              ) : todaySchedule.length === 0 ? (
                <div className="p-8 text-center text-secondary bg-cream rounded-xl">
                  No pickups scheduled for today.
                </div>
              ) : (
                <div className="table-container pt-0">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Customer</th>
                        <th>Outfit / Product</th>
                        <th>Status</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todaySchedule.map((item: any) => (
                        <tr key={item.id}>
                          <td className="font-semibold text-sm whitespace-nowrap">
                            {item.appointment_time_formatted || 'Scheduled'}
                          </td>
                          <td className="text-sm font-medium">{item.customer_name}</td>
                          <td className="text-sm text-secondary">
                            {item.product_name} · {item.size} {item.color ? `(${item.color})` : ''}
                          </td>
                          <td>
                            <span className={`badge ${item.status === 'Completed' ? 'accent' : item.status === 'Preparing' ? 'warning' : 'secondary'}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="text-right">
                            <button
                              className="btn-outline small"
                              onClick={() => navigate(`/reservations?search=${encodeURIComponent(item.display_id || item.customer_name)}`)}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: Business Snapshot (Month-to-Date Reusing Analytics Contract) */}
        {widgetPrefs.widgetBusinessSnapshot && (
          <div className="card">
            <div className="card-header border-none flex-between">
              <div className="flex align-center gap-2">
                <TrendingUp size={20} className="text-accent" />
                <h3>Business Pulse (MTD)</h3>
              </div>
              <Link to="/analytics" className="text-xs text-accent hover:underline flex align-center gap-1 font-medium">
                Full Analytics <ArrowRight size={14} />
              </Link>
            </div>

            <div className="p-4 pt-0">
              {snapshot.loading ? (
                <div className="p-8 text-center text-secondary">
                  <RefreshCw className="animate-spin inline mr-2" size={16} /> Loading pulse...
                </div>
              ) : snapshot.error ? (
                <div className="p-6 text-center text-danger">
                  <p>Unable to load snapshot.</p>
                  <button className="btn-outline small mt-2" onClick={() => loadSnapshot(opsData?.business_date)}>Retry</button>
                </div>
              ) : (
                <div className="flex flex-column gap-4">
                  <div className="p-3 rounded-lg border border-color" style={{ borderColor: 'var(--border-light)' }}>
                    <div className="text-xs text-secondary font-medium">Gross Cash Collected</div>
                    <div className="text-xl font-bold text-charcoal mt-1">
                      ₱{(mtdOverview?.gross_cash_collected?.current || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-secondary mt-0.5">Paid inflows received this month</div>
                  </div>

                  <div className="p-3 rounded-lg border border-color" style={{ borderColor: 'var(--border-light)' }}>
                    <div className="text-xs text-secondary font-medium">Completed Booking Value</div>
                    <div className="text-xl font-bold text-charcoal mt-1">
                      ₱{(mtdOverview?.completed_booking_value?.current || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-secondary mt-0.5">Value of completed rentals this month</div>
                  </div>

                  <div className="p-3 rounded-lg border border-color" style={{ borderColor: 'var(--border-light)' }}>
                    <div className="text-xs text-secondary font-medium">Completed Bookings</div>
                    <div className="text-xl font-bold text-charcoal mt-1">
                      {mtdOverview?.completed_reservations?.current || 0}
                    </div>
                    <div className="text-xs text-secondary mt-0.5">Fulfilled customer reservations</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* INVENTORY ATTENTION & OPERATIONAL ACTIVITY GRID */}
      <div className="analytics-layout mt-6">
        {/* Left: Inventory Attention Widget */}
        {widgetPrefs.widgetInventoryAttention && (
          <div className="card">
            <div className="card-header border-none flex-between">
              <div className="flex align-center gap-2">
                <AlertTriangle size={20} className="text-accent" />
                <h3>Inventory Attention</h3>
              </div>
              <Link to="/inventory" className="text-xs text-accent hover:underline flex align-center gap-1 font-medium">
                Inventory Catalog <ArrowRight size={14} />
              </Link>
            </div>

            <div className="p-4 pt-0">
              {inventory.loading ? (
                <div className="p-8 text-center text-secondary">
                  <RefreshCw className="animate-spin inline mr-2" size={16} /> Loading inventory attention...
                </div>
              ) : inventory.error ? (
                <div className="p-6 text-center text-danger">
                  <p>Unable to load inventory data.</p>
                  <button className="btn-outline small mt-2" onClick={loadInventory}>Retry</button>
                </div>
              ) : (
                <>
                  {/* Canonical Partition Chips */}
                  <div className="flex gap-2 flex-wrap mb-4">
                    <Link to="/inventory?stock=out" style={{ textDecoration: 'none' }}>
                      <span className="badge-danger cursor-pointer hover:opacity-80">
                        {invHealth?.out_of_stock_variants || 0} Out of Stock
                      </span>
                    </Link>
                    <Link to="/inventory?stock=low" style={{ textDecoration: 'none' }}>
                      <span className="badge warning cursor-pointer hover:opacity-80" style={{ backgroundColor: 'var(--stock-low-bg)', color: 'var(--stock-low)' }}>
                        {invHealth?.low_stock_variants || 0} Low Stock (≤ 2)
                      </span>
                    </Link>
                    <Link to="/inventory" style={{ textDecoration: 'none' }}>
                      <span className="badge secondary cursor-pointer hover:opacity-80">
                        {invHealth?.in_stock_variants || 0} In Stock
                      </span>
                    </Link>
                  </div>

                  {/* Top 5 Urgent Restock Variants */}
                  <div className="widget-list">
                    {invAlerts.length === 0 ? (
                      <div className="p-4 text-center text-secondary">All stock levels healthy ✅</div>
                    ) : (
                      invAlerts.map((item: any, idx: number) => (
                        <div key={item.inventory_id || item.sku || idx} className="widget-item alert-item flex-between align-center">
                          <div className="flex align-center gap-3">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.product_name} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                            ) : (
                              <div className="item-icon-bg alert" style={{ backgroundColor: item.stock_tier === 'out_of_stock' ? 'var(--status-cancelled-bg)' : 'var(--stock-low-bg)' }}>
                                <AlertTriangle size={18} className={item.stock_tier === 'out_of_stock' ? 'text-danger' : 'text-warning'} />
                              </div>
                            )}
                            <div>
                              <h4 className="text-sm font-semibold">{item.product_name}</h4>
                              <p className="text-xs text-secondary">
                                Size {item.size} · {item.color} ·{' '}
                                <span className={item.stock_tier === 'out_of_stock' ? 'text-danger font-bold' : 'text-warning font-semibold'}>
                                  {item.available} / {item.total} available
                                </span>
                                {(item.reserved || 0) > 0 && (
                                  <span className="text-secondary ml-1">({item.reserved} reserved)</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <button className="btn-outline small" onClick={() => navigate('/inventory')}>
                            Restock
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Right: Customer Pulse & Operational Activity */}
        <div className="flex flex-column gap-6">
          {/* Recent Signups */}
          {widgetPrefs.widgetRecentSignups && (
            <div className="card">
              <div className="card-header border-none flex-between">
                <div className="flex align-center gap-2">
                  <Users size={20} className="text-accent" />
                  <h3>Recent Signups</h3>
                </div>
                <Link to="/customers" className="text-xs text-accent hover:underline flex align-center gap-1 font-medium">
                  All Customers <ArrowRight size={14} />
                </Link>
              </div>

              <div className="widget-list p-4 pt-0">
                {activityDomain.loading ? (
                  <div className="p-4 text-center text-secondary text-sm">Loading signups...</div>
                ) : activityDomain.error ? (
                  <div className="text-xs text-danger p-2 text-center">Unable to load signups.</div>
                ) : recentSignups.length === 0 ? (
                  <div className="p-4 text-center text-secondary text-xs">No registered customers yet.</div>
                ) : (
                  recentSignups.map((c: any, idx: number) => (
                    <div key={c.id || idx} className="widget-item flex-between align-center">
                      <div className="flex align-center gap-3">
                        <div
                          className="avatar-small"
                          style={{ backgroundColor: `hsl(${200 + idx * 40}, 50%, 50%)` }}
                        >
                          {getUserDisplayName(c)[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">{getUserDisplayName(c)}</h4>
                          <p className="text-xs text-secondary">
                            {c.created_at ? relativeTime(c.created_at) : 'Registered customer'}
                          </p>
                        </div>
                      </div>
                      <button className="icon-btn small" onClick={() => navigate(`/customers`)}>
                        <Users size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Recent Operational Activity */}
          {widgetPrefs.widgetRecentActivity && (
            <div className="card">
              <div className="card-header border-none flex-between">
                <div className="flex align-center gap-2">
                  <Activity size={20} className="text-accent" />
                  <h3>Recent Activity</h3>
                </div>
                <Link to="/activity-log" className="text-xs text-accent hover:underline flex align-center gap-1 font-medium">
                  Full Log <ArrowRight size={14} />
                </Link>
              </div>

              <div className="activity-pulse-list p-4 pt-0">
                {activityDomain.loading ? (
                  <div className="p-4 text-center text-secondary text-sm">Loading activity...</div>
                ) : activityDomain.error ? (
                  <div className="text-xs text-danger p-2 text-center">Unable to load activity.</div>
                ) : recentLogs.length === 0 ? (
                  <div className="p-4 text-center text-secondary text-xs">No recent operational activity.</div>
                ) : (
                  recentLogs.map((log: any) => {
                    const sentence = formatLogSentence(log);
                    return (
                      <div key={log.id} className="activity-pulse-item flex align-center gap-3 py-2 border-b border-color" style={{ borderColor: 'var(--border-light)' }}>
                        <div className="activity-icon-sm">
                          <Activity size={14} className="text-accent" />
                        </div>
                        <div className="activity-pulse-content flex-1">
                          <p className="text-xs text-charcoal font-medium">
                            <span className="font-semibold">{log.user_name || 'Staff'}: </span>
                            {sentence.action || log.action}{' '}
                            {sentence.subject && <span className="font-semibold">{sentence.subject} </span>}
                            {sentence.amount && <span className="text-accent font-semibold">{sentence.amount}</span>}
                          </p>
                          <span className="text-xs text-secondary">{relativeTime(log.timestamp)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CUSTOMIZE MODAL */}
      {showPreferences && canCustomize && (
        <div
          className="modal-overlay"
          onClick={() => setShowPreferences(false)}
          onKeyDown={(e) => e.key === 'Escape' && setShowPreferences(false)}
          role="button"
          tabIndex={0}
          aria-label="Close preferences"
        >
          <div className="preferences-modal" onClick={(e) => e.stopPropagation()} role="presentation">
            <div className="preferences-header">
              <h3>Customize Dashboard</h3>
              <button className="icon-btn" onClick={() => setShowPreferences(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="preferences-body">
              <div className="pref-section">
                <h4>Operational KPIs</h4>
                <div className="pref-list">
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-action-req">Action Required</label>
                    <label className="toggle-switch" aria-label="Toggle Action Required">
                      <input type="checkbox" id="pref-action-req" className="toggle-input" checked={widgetPrefs.statActionRequired} onChange={() => togglePref('statActionRequired')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-prep">In Preparation</label>
                    <label className="toggle-switch" aria-label="Toggle In Preparation">
                      <input type="checkbox" id="pref-prep" className="toggle-input" checked={widgetPrefs.statPreparing} onChange={() => togglePref('statPreparing')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-pickup">Ready for Pickup</label>
                    <label className="toggle-switch" aria-label="Toggle Ready for Pickup">
                      <input type="checkbox" id="pref-pickup" className="toggle-input" checked={widgetPrefs.statReadyForPickup} onChange={() => togglePref('statReadyForPickup')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-refunds">Pending Refunds</label>
                    <label className="toggle-switch" aria-label="Toggle Pending Refunds">
                      <input type="checkbox" id="pref-refunds" className="toggle-input" checked={widgetPrefs.statPendingRefunds} onChange={() => togglePref('statPendingRefunds')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pref-section">
                <h4>Operational Widgets</h4>
                <div className="pref-list">
                  <div className="pref-item">
                    <span className="pref-label">Today&apos;s Pickups</span>
                    <label className="toggle-switch" aria-label="Toggle Today's Pickups">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetTodaySchedule} onChange={() => togglePref('widgetTodaySchedule')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Business Snapshot (MTD)</span>
                    <label className="toggle-switch" aria-label="Toggle Business Snapshot">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetBusinessSnapshot} onChange={() => togglePref('widgetBusinessSnapshot')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Inventory Attention</span>
                    <label className="toggle-switch" aria-label="Toggle Inventory Attention">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetInventoryAttention} onChange={() => togglePref('widgetInventoryAttention')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Recent Signups</span>
                    <label className="toggle-switch" aria-label="Toggle Recent Signups">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetRecentSignups} onChange={() => togglePref('widgetRecentSignups')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Recent Activity</span>
                    <label className="toggle-switch" aria-label="Toggle Recent Activity">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetRecentActivity} onChange={() => togglePref('widgetRecentActivity')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
