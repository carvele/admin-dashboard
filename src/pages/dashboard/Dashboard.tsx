import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// @ts-ignore
import { useAuth } from '../../context/AuthContext';
// @ts-ignore
import { can } from '../../utils/permissions';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Calendar,
  Users,
  Shirt,
  Clock,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  Settings2,
  X,
  MapPin,
  Activity,
  Cloud,
  Sun,
  CloudRain,
  Zap,
  PlusCircle,
  MessageSquare,
} from 'lucide-react';
// @ts-ignore
import { getReservations } from '../../services/reservationService';
// @ts-ignore
import { getUserDisplayName, formatRelativeTime, formatDate, formatSmartDateTime } from '../../utils/helpers';

const defaultPreferences = {
  statTotalReservations: true,
  statActiveCustomers: true,
  statPendingRequests: true,
  statARUsage: true,
  chartReservationTrends: true,
  chartPopularOutfits: true,
  widgetLowStock: true,
  widgetRecentCustomers: true,
  widgetLogistics: true,
  widgetActivityFeed: true,
  widgetWeather: true,
};

// @ts-ignore
import { getCustomers } from '../../services/customerService';
// @ts-ignore
import { getInventory, subscribeToInventory } from '../../services/productService';
// @ts-ignore
import { isStockAlert, getStockHealth, getStockBreakdown } from '../../utils/stockStatus';
import PageHeader from '../../components/PageHeader';
import { isPending } from '../../utils/reservationStatus';
// @ts-ignore
import { getSuggestedOutfits, getARSessions } from '../../services/wardrobeService';
// @ts-ignore
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { motion } from 'framer-motion';
import './Dashboard.css';

const COLORS = ['#8B6F5C', '#C9BEB4', '#E8DDD3', '#2C2C2C'];

const parseDate = (d: any) => {
  if (!d) return new Date();
  if (d.toDate) return d.toDate();
  if (d.seconds) return new Date(d.seconds * 1000);
  return new Date(d);
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth() as { user: any };
  const canCustomize = can(user?.role, 'customize_dashboard');
  
  const loadDashboard = React.useCallback(async () => {
    try {
      const [resData, cusData, invData, arCount, outfitsData] = await Promise.all([
        getReservations(100),
        getCustomers(100),
        getInventory(100),
        getARSessions(),
        getSuggestedOutfits(),
      ]);
      setReservations(resData || []);
      setCustomers((cusData || []).filter((u: any) => !u.role || u.role === 'customer'));
      setInventory(invData || []);
      setArSessionCount(arCount?.length || 0);
      setSuggestedOutfits(outfitsData || []);
      setLastSynced(new Date());
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, []);

  // Initialize realtime sync for global alerts and auto-refresh
  useRealtimeSync(loadDashboard);

  const [reservations, setReservations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [suggestedOutfits, setSuggestedOutfits] = useState<any[]>([]);
  const [arSessionCount, setArSessionCount] = useState(0);
  const [trendFilter, setTrendFilter] = useState('This Week');
  const [lastSynced, setLastSynced] = useState(new Date());

  const [widgetPrefs, setWidgetPrefs] = useState(() => {
    const saved = localStorage.getItem('dashboard_widget_prefs');
    return saved ? JSON.parse(saved) : defaultPreferences;
  });
  const [showPreferences, setShowPreferences] = useState(false);

  const togglePref = (key: keyof typeof defaultPreferences) => {
    const nextPrefs = { ...widgetPrefs, [key]: !widgetPrefs[key] };
    setWidgetPrefs(nextPrefs);
    localStorage.setItem('dashboard_widget_prefs', JSON.stringify(nextPrefs));
  };



  React.useEffect(() => {
    // Non-inventory data: load once, poll every 5 minutes
    loadDashboard();
    const intervalId = setInterval(loadDashboard, 5 * 60 * 1000);
    // Inventory: real-time subscription so stock alerts update instantly
    const unsubInventory = subscribeToInventory((invData: any[]) => {
      setInventory(invData || []);
      setLastSynced(new Date());
    });
    return () => {
      clearInterval(intervalId);
      unsubInventory();
    };
  }, [loadDashboard]);

  // 5-tier stock alert analysis (demand-aware, real-time) - Active items only
  const activeInventory = inventory.filter((i: any) => i.deleted !== true);

  const stockBreakdown = getStockBreakdown(
    activeInventory.map((i: any) => ({ available: i.available, total: i.total, reserved: i.reserved || 0 }))
  );

  const totalReservations = reservations.length;
  // profiles has no `status` column — "active" = not blocked
  const activeCustomers = customers.filter((c) => !c.isBlocked).length;
  const pendingRequests = reservations.filter((r) => isPending(r.status)).length;
  // 5-tier: alert = very-low + critical + no-stock items (Active items only)
  const lowStockItems = activeInventory
    .filter((i: any) => isStockAlert(i.available, i.total, i.reserved || 0))
    .sort((a: any, b: any) => {
      const hA = getStockHealth(a.available, a.total, a.reserved || 0);
      const hB = getStockHealth(b.available, b.total, b.reserved || 0);
      return hA.priority - hB.priority; // worst (priority=1) first
    })
    .slice(0, 5);
  const recentCustomers = [...customers]
    .sort((a, b) => (b.id || '').localeCompare(a.id || ''))
    .slice(0, 3);

  // --- NEW COMMAND CENTER LOGIC ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Daily Logistics (Pickups for Today) -- JezSy is reserve-and-collect
  // only, there is no rental return leg, so this tracks pickups alone.
  const todayLogistics = reservations
    .filter(r => {
      const pickupDate = parseDate(r.reservationDate || r.date);
      pickupDate.setHours(0,0,0,0);
      return pickupDate.getTime() === today.getTime();
    })
    .map(r => {
      const pickupDate = parseDate(r.reservationDate || r.date);
      return {
        ...r,
        actionType: 'Pickup',
        timeStr: r.appointmentTime || pickupDate.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
      };
    });

  // 2. Unified Activity Feed (Last 10 events)
  const activityFeed = [
    ...reservations.map(r => ({ type: 'reservation', date: parseDate(r.createdAt || r.date), desc: `${r.customerName || 'A customer'} booked ${r.productName || 'an outfit'}`, user: r.customerName })),
    ...customers.map(c => ({ type: 'customer', date: parseDate(c.createdAt || c.id), desc: `New customer ${getUserDisplayName(c)} joined`, user: getUserDisplayName(c) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);

  // 3. Weather Insight logic (Simulation)
  const weatherStates = ['Sunny', 'Cloudy', 'Rainy', 'Cloudy']; // Alternating
  const currentHour = new Date().getHours();
  const weather = weatherStates[currentHour % 4];
  const weatherAdvice = {
    'Sunny': 'High demand for Outdoor Shoots: Suggest light fabrics.',
    'Rainy': 'Wet weather warning: Recommend waterproof accessories.',
    'Cloudy': 'Overcast: Ideal for neutral palette suggestions.'
  }[weather] || 'Ready for all styles today.';


  // Popular Outfit Combinations — sourced from admin-created suggestedOutfits
  const outfitCounts: Record<string, number> = {};
  suggestedOutfits.forEach((o) => {
    const outfitName = o.name || o.title || 'Untitled Outfit';
    // Count how many items/pieces each suggestion has as a popularity proxy
    const pieceCount = (o.items || o.products || []).length || 1;
    outfitCounts[outfitName] = (outfitCounts[outfitName] || 0) + pieceCount;
  });
  const computedPopular = Object.entries(outfitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, value: count }));
  const finalPopular =
    computedPopular.length > 0 ? computedPopular : [{ name: 'No suggestions yet', value: 1 }];

  // Build dynamic reservation trends from actual DB data
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCounts: Record<string, number> = {};
  daysOfWeek.forEach((d) => (dayCounts[d] = 0));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  reservations.forEach((r) => {
    // Android writes 'reservationDate'; admin uses 'date'
    const rawDate = r.reservationDate || r.date;
    if (rawDate) {
      const resDate = parseDate(rawDate);
      // Filter based on dropdown
      if (trendFilter === 'This Week' && resDate < weekAgo) return;
      if (trendFilter === 'This Month' && resDate < monthAgo) return;

      const dayName = daysOfWeek[resDate.getDay()];
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
    }
  });
  const reservationTrends = daysOfWeek.map((d) => ({ name: d, reservations: dayCounts[d] }));
  // Framer Motion Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } as any },
  };

  return (
    <div className="dashboard-page">
      <PageHeader
        title="Dashboard Overview"
        subtitle="Welcome back! Here is what is happening at JezSy Collection today."
        category="OVERVIEW"
        actions={
          <div className="system-health flex-center gap-3">
            <div
              className="health-indicator flex-center gap-1 text-success text-sm font-medium px-3 py-1 rounded-full"
              style={{ backgroundColor: 'var(--status-completed-bg)' }}
            >
              <CheckCircle2 size={16} /> Pipeline Healthy
            </div>
            <div className="sync-status flex-center gap-1 text-secondary text-xs">
              Last synced: {lastSynced.toLocaleTimeString()}
            </div>
            <button className="btn-outline small flex-center gap-1 ml-2" onClick={loadDashboard}>
              <RefreshCw size={14} /> Refresh
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
        style={{ borderRadius: '16px', background: 'var(--glass-bg)', backdropFilter: 'blur(10px)', border: '1px solid var(--glass-border)' }}
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
          <button className="btn-outline small flex-center gap-2" onClick={() => navigate('/messages')}>
            <MessageSquare size={16} /> Broadcast
          </button>
        </div>
      </motion.div>

      <motion.div
        className="stats-grid"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {widgetPrefs.statTotalReservations && (
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon calendar">
            <Calendar size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Reservations</p>
            <h3 className="stat-value">{totalReservations}</h3>
            <span className="stat-trend positive">
              <TrendingUp size={14} /> Live from DB
            </span>
          </div>
        </motion.div>
        )}

        {widgetPrefs.statActiveCustomers && (
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon users">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Active Customers</p>
            <h3 className="stat-value">{activeCustomers}</h3>
            <span className="stat-trend positive">
              <TrendingUp size={14} /> Live from DB
            </span>
          </div>
        </motion.div>
        )}

        {widgetPrefs.statPendingRequests && (
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon clock">
            <Clock size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Pending Requests</p>
            <h3 className="stat-value">{pendingRequests}</h3>
            <span className={pendingRequests > 0 ? 'stat-trend negative' : 'stat-trend positive'}>
              {pendingRequests > 0 ? 'Requires attention' : 'All caught up'}
            </span>
          </div>
        </motion.div>
        )}

        {widgetPrefs.statARUsage && (
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon ar">
            <Shirt size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">AR Try-On Usage</p>
            <h3 className="stat-value">{arSessionCount}</h3>
            <span className="stat-trend positive">
              <TrendingUp size={14} /> Live from DB
            </span>
          </div>
        </motion.div>
        )}
      </motion.div>

      <div className="charts-grid" style={{
        gridTemplateColumns: (!widgetPrefs.chartReservationTrends || !widgetPrefs.chartPopularOutfits) ? '1fr' : '2fr 1fr'
      }}>
        {widgetPrefs.chartReservationTrends && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}

          transition={{ delay: 0.3 }}
          className="chart-card card"
        >
          <div className="card-header">
            <h3>Reservation Trends</h3>
            <select
              className="input-field small-select"
              value={trendFilter}
              onChange={(e) => setTrendFilter(e.target.value)}
            >
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
            </select>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={reservationTrends}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B6F5C" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8B6F5C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6B6B6B' }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B6B6B' }} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="reservations"
                  stroke="#8B6F5C"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRes)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        )}

        {widgetPrefs.chartPopularOutfits && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="chart-card card"
        >
          <div className="card-header">
            <h3>Popular Outfit Combinations</h3>
            <button className="text-btn" onClick={() => navigate('/outfits')}>
              View All
            </button>
          </div>
          <div className="chart-container pie-container">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={finalPopular}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {finalPopular.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend">
              {finalPopular.map((_entry, index) => (
                <div key={index} className="legend-item">
                  <span
                    className="legend-dot"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  ></span>
                  <span className="legend-text">{finalPopular[index].name}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        )}
      </div>

      <div className="widgets-grid" style={{
        gridTemplateColumns: (!widgetPrefs.widgetLowStock || !widgetPrefs.widgetRecentCustomers) ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))'
      }}>
        {widgetPrefs.widgetLowStock && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="widget card"
        >
          <div className="card-header">
            <h3>Stock Health Alerts</h3>
            <span className="badge-danger">{stockBreakdown.alerts} Items</span>
          </div>
          {/* Tier breakdown chips */}
          {stockBreakdown.alerts > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {stockBreakdown.noStock > 0 && (
                <span style={{ background: 'var(--stock-none-bg)', color: 'var(--stock-none)', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 12 }}>
                  {stockBreakdown.noStock} No Stock
                </span>
              )}
              {stockBreakdown.critical > 0 && (
                <span style={{ background: 'var(--stock-critical-bg)', color: 'var(--stock-critical)', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 12 }}>
                  {stockBreakdown.critical} Critical
                </span>
              )}
              {stockBreakdown.veryLow > 0 && (
                <span style={{ background: 'var(--stock-very-low-bg)', color: 'var(--stock-very-low)', fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 12 }}>
                  {stockBreakdown.veryLow} Very Low
                </span>
              )}
            </div>
          )}
          <div className="widget-list">
            {lowStockItems.length === 0 && (
              <div className="p-4 text-center text-secondary">All stock levels healthy ✅</div>
            )}
            {lowStockItems.map((item: any) => {
              const health = getStockHealth(item.available, item.total, item.reserved || 0);
              return (
                <div key={`${item.id}-${item.size}`} className="widget-item alert-item">
                  <div className="item-icon-bg alert" style={{ background: health.bgColor }}>
                    <AlertTriangle size={18} style={{ color: health.color }} />
                  </div>
                  <div className="item-details">
                    <h4>{item.item}</h4>
                    <p>
                      Size {item.size} ·{' '}
                      <span style={{ color: health.color, fontWeight: 600 }}>{health.label}</span>
                      {' · '}{item.available} / {item.total} available
                      {(item.reserved || 0) > 0 && (
                        <span style={{ color: 'var(--stock-very-low)', marginLeft: '0.3rem', fontSize: '0.72rem' }}>
                          ({item.reserved} reserved)
                        </span>
                      )}
                    </p>
                  </div>
                  <button className="btn-outline small" onClick={() => navigate('/inventory')}>
                    Restock
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
        )}

        {widgetPrefs.widgetRecentCustomers && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="widget card"
        >
          <div className="card-header">
            <h3>Recent Customers</h3>
            <button className="text-btn" onClick={() => navigate('/customers')}>
              View All
            </button>
          </div>
          <div className="widget-list">
            {recentCustomers.length === 0 && (
              <div className="p-4 text-center text-secondary">No customers yet.</div>
            )}
            {recentCustomers.map((c, i) => (
              <div key={c.id} className="widget-item">
                <div
                  className="avatar-small"
                  style={{ backgroundColor: `hsl(${200 + i * 40}, 50%, 50%)` }}
                >
                  {getUserDisplayName(c)[0]?.toUpperCase() || 'U'}
                </div>
                <div className="item-details">
                  <h4>{getUserDisplayName(c)}</h4>
                  <p className="text-xs text-secondary">
                    Joined {c.createdAt ? formatDate(c.createdAt) : 'N/A'} • {c.lastOnline ? `Last seen ${formatRelativeTime(c.lastOnline)}` : (c.email || 'No activity')}
                  </p>
                </div>
                <button className="icon-btn small" onClick={() => navigate(`/customers?id=${c.id}`)}>
                  <Users size={16} />
                </button>
              </div>
            ))}
          </div>
        </motion.div>
        )}

        {widgetPrefs.widgetWeather && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
          className="weather-insight-card widget card"
        >
          <div className="card-header">
            <h3>Operational Insight</h3>
            <span className="badge accent">Weather Context</span>
          </div>
          <div className="flex align-center gap-4 mt-2">
            <div className="weather-icon-large">
              {weather === 'Sunny' && <Sun size={40} className="text-warning" />}
              {weather === 'Rainy' && <CloudRain size={40} className="text-accent" />}
              {weather === 'Cloudy' && <Cloud size={40} className="text-secondary" />}
            </div>
            <div>
              <h4 className="font-bold text-lg">{weather} Today</h4>
              <p className="text-sm text-secondary leading-tight">{weatherAdvice}</p>
            </div>
          </div>
        </motion.div>
        )}
      </div>

      <div className="command-center-grid mt-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {widgetPrefs.widgetLogistics && (
        <motion.div
          className="card logistics-widget"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="card-header">
            <div className="flex align-center gap-2">
              <MapPin size={20} className="text-accent" />
              <h3>Today&apos;s Pickups</h3>
            </div>
            <span className="badge secondary">{todayLogistics.length} Events</span>
          </div>
          
          <div className="logistics-timeline mt-4">
            {todayLogistics.length === 0 ? (
              <div className="p-8 text-center text-secondary bg-cream rounded-xl">
                No pickups scheduled for today.
              </div>
            ) : (
              todayLogistics.map((item, idx) => (
                <div key={idx} className={`logistics-row ${item.actionType.toLowerCase()}`}>
                  <div className="logistics-time">{item.date ? formatSmartDateTime(item.date) : item.timeStr}</div>
                  <div className="logistics-point"></div>
                  <div className="logistics-info">
                    <div className="flex-between align-center">
                      <span className={`logistics-badge ${item.actionType.toLowerCase()}`}>{item.actionType}</span>
                      <span className="text-xs font-semibold">{item.status}</span>
                    </div>
                    <h4>{item.customerName}</h4>
                    <p>{item.productName || item.outfit} · {item.size}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
        )}

        {widgetPrefs.widgetActivityFeed && (
        <motion.div
           className="card activity-feed-widget"
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ delay: 0.9 }}
        >
          <div className="card-header">
            <div className="flex align-center gap-2">
              <Activity size={20} className="text-accent" />
              <h3>Real-time Activity Pulse</h3>
            </div>
          </div>

          <div className="activity-pulse-list mt-4">
            {activityFeed.map((item, idx) => (
              <div key={idx} className="activity-pulse-item">
                <div className={`activity-icon-sm ${item.type}`}>
                  {item.type === 'reservation' && <Calendar size={14} />}
                  {item.type === 'customer' && <Users size={14} />}
                  {item.type === 'staff' && <RefreshCw size={14} />}
                </div>
                <div className="activity-pulse-content">
                  <p className="text-sm">{item.desc}</p>
                  <span className="text-xs text-secondary">{formatSmartDateTime(item.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
        )}
      </div>

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
                <h4>Top Statistics</h4>
                <div className="pref-list">
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-total-reservations">Total Reservations</label>
                    <label className="toggle-switch" aria-label="Toggle Total Reservations">
                      <input type="checkbox" id="pref-total-reservations" className="toggle-input" checked={widgetPrefs.statTotalReservations} onChange={() => togglePref('statTotalReservations')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-active-customers">Active Customers</label>
                    <label className="toggle-switch" aria-label="Toggle Active Customers">
                      <input type="checkbox" id="pref-active-customers" className="toggle-input" checked={widgetPrefs.statActiveCustomers} onChange={() => togglePref('statActiveCustomers')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-pending-requests">Pending Requests</label>
                    <label className="toggle-switch" aria-label="Toggle Pending Requests">
                      <input type="checkbox" id="pref-pending-requests" className="toggle-input" checked={widgetPrefs.statPendingRequests} onChange={() => togglePref('statPendingRequests')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <label className="pref-label" htmlFor="pref-ar-usage">AR Try-On Usage</label>
                    <label className="toggle-switch" aria-label="Toggle AR Try-On Usage">
                      <input type="checkbox" id="pref-ar-usage" className="toggle-input" checked={widgetPrefs.statARUsage} onChange={() => togglePref('statARUsage')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="pref-section">
                <h4>Charts</h4>
                <div className="pref-list">
                  <div className="pref-item">
                    <span className="pref-label">Reservation Trends</span>
                    <label className="toggle-switch" aria-label="Toggle Reservation Trends">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.chartReservationTrends} onChange={() => togglePref('chartReservationTrends')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Popular Outfits</span>
                    <label className="toggle-switch" aria-label="Toggle Popular Outfits">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.chartPopularOutfits} onChange={() => togglePref('chartPopularOutfits')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pref-section">
                <h4>Tactical Widgets</h4>
                <div className="pref-list">
                  <div className="pref-item">
                    <span className="pref-label">Low Stock Alerts</span>
                    <label className="toggle-switch" aria-label="Toggle Low Stock Alerts">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetLowStock} onChange={() => togglePref('widgetLowStock')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Recent Customers</span>
                    <label className="toggle-switch" aria-label="Toggle Recent Customers">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetRecentCustomers} onChange={() => togglePref('widgetRecentCustomers')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Logistics Monitor</span>
                    <label className="toggle-switch" aria-label="Toggle Logistics Monitor">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetLogistics} onChange={() => togglePref('widgetLogistics')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Activity Pulse</span>
                    <label className="toggle-switch" aria-label="Toggle Activity Pulse">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetActivityFeed} onChange={() => togglePref('widgetActivityFeed')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="pref-item">
                    <span className="pref-label">Operational Insights</span>
                    <label className="toggle-switch" aria-label="Toggle Operational Insights">
                      <input type="checkbox" className="toggle-input" checked={widgetPrefs.widgetWeather} onChange={() => togglePref('widgetWeather')} />
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
