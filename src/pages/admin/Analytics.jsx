import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Download, Calendar, TrendingUp, Users, ShoppingBag, Settings2, X, ChevronDown, Activity, AlertCircle, AlertTriangle, Package } from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import PageHeader from '../../components/PageHeader';
import {
  getAnalyticsOverview,
  getReservationAnalytics,
  getCashflowAnalytics,
  getInventoryHealthAnalytics,
  getProductPerformanceAnalytics,
  getCustomerCohortAnalytics,
} from '../../services/analyticsService';
import './Analytics.css';

const StatCard = ({ title, value, change, icon: Icon, trend, tooltip, drilldownTo, alertStyle }) => {
  const alertClasses = alertStyle === 'danger'
    ? 'border-red-200 bg-red-50/40 dark:bg-red-950/20'
    : alertStyle === 'warning'
    ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/20'
    : '';

  const content = (
    <div className={`card stat-card ${alertClasses} ${drilldownTo ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} title={tooltip || ''}>
      <div className="stat-header">
        <div className="stat-title font-semibold">{title}</div>
        <div
          className={`stat-icon ${alertStyle === 'danger' ? 'text-danger' : alertStyle === 'warning' ? 'text-warning' : trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-secondary'}`}
        >
          <Icon size={20} />
        </div>
      </div>
      <div className={`stat-value ${alertStyle === 'danger' ? 'text-danger' : ''}`}>{value}</div>
      <div
        className={`stat-change font-medium ${alertStyle === 'danger' ? 'text-danger' : alertStyle === 'warning' ? 'text-warning' : trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-secondary'}`}
      >
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {change}
      </div>
    </div>
  );

  if (drilldownTo) {
    return (
      <Link to={drilldownTo} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </Link>
    );
  }
  return content;
};

const Analytics = () => {
  const [overview, setOverview] = useState(null);
  const [resAnalytics, setResAnalytics] = useState(null);
  const [, setCashflowAnalytics] = useState(null);
  const [invHealth, setInvHealth] = useState(null);
  const [prodPerf, setProdPerf] = useState(null);
  const [cohortAnalytics, setCohortAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [dateRange, setDateRange] = useState('30d');
  const getLocalDateString = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });
  const [endDate, setEndDate] = useState(getLocalDateString(new Date()));

  const [showPreferences, setShowPreferences] = useState(false);
  const [exportRef, setExportRef] = useState(false);
  const [widgetPrefs, setWidgetPrefs] = useState(() => {
    const savedPrefs = localStorage.getItem('analytics_widget_prefs');
    if (savedPrefs) {
      try {
        return JSON.parse(savedPrefs);
      } catch (e) {
        console.error('Error parsing widget preferences', e);
      }
    }
    return {
      showTopStats: true,
      showRevenueTrends: true,
      showCategoryShare: true,
      showTopItems: true,
      showMetrics: true,
    };
  });

  useEffect(() => {
    localStorage.setItem('analytics_widget_prefs', JSON.stringify(widgetPrefs));
  }, [widgetPrefs]);

  const handleTogglePref = (key) => {
    setWidgetPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Fetch all analytics from canonical PostgreSQL RPCs
  useEffect(() => {
    let isMounted = true;
    const fetchAllAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const [ov, res, cf, inv, prod, cohort] = await Promise.all([
          getAnalyticsOverview(startDate, endDate),
          getReservationAnalytics(startDate, endDate),
          getCashflowAnalytics(startDate, endDate),
          getInventoryHealthAnalytics(),
          getProductPerformanceAnalytics(startDate, endDate),
          getCustomerCohortAnalytics(startDate, endDate),
        ]);

        if (!isMounted) return;
        setOverview(ov);
        setResAnalytics(res);
        setCashflowAnalytics(cf);
        setInvHealth(inv);
        setProdPerf(prod);
        setCohortAnalytics(cohort);
      } catch (err) {
        if (!isMounted) return;
        console.error('Failed to load canonical analytics:', err);
        setError(err.message || 'Failed to load analytics data.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAllAnalytics();
    return () => { isMounted = false; };
  }, [startDate, endDate]);

  const handleDatePresetChange = (preset) => {
    setDateRange(preset);
    const now = new Date();
    let start = new Date();

    if (preset === '7d') start.setDate(now.getDate() - 7);
    else if (preset === '30d') start.setDate(now.getDate() - 30);
    else if (preset === 'quarter') start.setMonth(now.getMonth() - 3);
    else if (preset === 'ytd') start = new Date(now.getFullYear(), 0, 1);

    setStartDate(getLocalDateString(start));
    setEndDate(getLocalDateString(now));
  };

  // Helper for computing delta display
  const computeDelta = useCallback((current, previous) => {
    if (previous === 0 || previous === null || previous === undefined) {
      if (current > 0) return { text: 'New this period', trend: 'up' };
      return { text: 'No change', trend: 'neutral' };
    }
    const diff = current - previous;
    const pct = Math.round((diff / previous) * 100);
    return {
      text: `${pct >= 0 ? '+' : ''}${pct}% vs prev period`,
      trend: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
    };
  }, []);

  const cashDelta = useMemo(() => {
    if (!overview?.gross_cash_collected) return { text: '--', trend: 'neutral' };
    return computeDelta(overview.gross_cash_collected.current, overview.gross_cash_collected.previous);
  }, [overview, computeDelta]);

  const bookingDelta = useMemo(() => {
    if (!overview?.completed_booking_value) return { text: '--', trend: 'neutral' };
    return computeDelta(overview.completed_booking_value.current, overview.completed_booking_value.previous);
  }, [overview, computeDelta]);

  const completedResDelta = useMemo(() => {
    if (!overview?.completed_reservations) return { text: '--', trend: 'neutral' };
    return computeDelta(overview.completed_reservations.current, overview.completed_reservations.previous);
  }, [overview, computeDelta]);

  const customerDelta = useMemo(() => {
    if (!overview?.unique_customers_served) return { text: '--', trend: 'neutral' };
    return computeDelta(overview.unique_customers_served.current, overview.unique_customers_served.previous);
  }, [overview, computeDelta]);

  const cancellationRateDisplay = useMemo(() => {
    if (!overview?.cancellation_rate) return { value: '0%', text: '0 cancelled' };
    const currRate = overview.cancellation_rate.current;
    const currCancelled = overview.cancellation_rate.current_cancelled || 0;
    return {
      value: currRate !== null ? `${currRate}%` : '0%',
      text: `${currCancelled} cancelled booking(s)`,
    };
  }, [overview]);

  const COLORS = ['#2B2B28', '#D97706', '#059669', '#6366F1', '#EC4899', '#8B5CF6'];

  const handleExport = (type) => {
    if (!overview) return;

    if (type === 'pdf') {
      const doc = new jsPDF();
      doc.text('JezSy Collection Analytics Summary Report', 14, 15);
      doc.text(`Period: ${startDate} to ${endDate} (Timezone: Asia/Manila)`, 14, 25);

      const tableColumn = ['Metric', 'Current Period', 'Previous Period'];
      const tableRows = [
        ['Gross Cash Collected', `P${(overview.gross_cash_collected?.current || 0).toLocaleString()}`, `P${(overview.gross_cash_collected?.previous || 0).toLocaleString()}`],
        ['Completed Booking Value', `P${(overview.completed_booking_value?.current || 0).toLocaleString()}`, `P${(overview.completed_booking_value?.previous || 0).toLocaleString()}`],
        ['Completed Reservations', `${overview.completed_reservations?.current || 0}`, `${overview.completed_reservations?.previous || 0}`],
        ['Unique Customers Served', `${overview.unique_customers_served?.current || 0}`, `${overview.unique_customers_served?.previous || 0}`],
        ['Cancellation Rate', `${overview.cancellation_rate?.current ?? 0}%`, `${overview.cancellation_rate?.previous ?? 0}%`],
        ['Pending Refund Liability', `P${(overview.pending_refund_liability?.amount || 0).toLocaleString()} (${overview.pending_refund_liability?.count || 0} bookings)`, 'Snapshot'],
      ];

      doc.autoTable(tableColumn, tableRows, { startY: 30 });
      doc.save(`JezSy_Analytics_${startDate}_to_${endDate}.pdf`);
    } else {
      const rows = [
        ['Metric', 'Current Period', 'Previous Period'],
        ['Gross Cash Collected', overview.gross_cash_collected?.current || 0, overview.gross_cash_collected?.previous || 0],
        ['Completed Booking Value', overview.completed_booking_value?.current || 0, overview.completed_booking_value?.previous || 0],
        ['Completed Reservations', overview.completed_reservations?.current || 0, overview.completed_reservations?.previous || 0],
        ['Unique Customers Served', overview.unique_customers_served?.current || 0, overview.unique_customers_served?.previous || 0],
        ['Cancellation Rate', overview.cancellation_rate?.current ?? 0, overview.cancellation_rate?.previous ?? 0],
        ['Pending Refund Liability', overview.pending_refund_liability?.amount || 0, 'Snapshot'],
      ];
      const csv = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `JezSy_Analytics_${startDate}_to_${endDate}.csv`;
      link.click();
    }
    setExportRef(false);
  };

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Analytics' }]}
        category="ANALYTICS"
        title="Analytics Dashboard"
        subtitle="Canonical business performance metrics for JezSy Collection (Asia/Manila)"
        actions={
          <div className="analytics-controls flex-center gap-3">
            <div className="date-picker-group">
              <div className="search-box">
                <Calendar size={18} className="search-icon" />
                <select
                  autoComplete="off"
                  id="analytics-date-preset"
                  name="analyticsDatePreset"
                  aria-label="Date range preset"
                  className="input-field pl-10 bg-transparent border-none font-medium"
                  value={dateRange}
                  onChange={(e) => handleDatePresetChange(e.target.value)}
                >
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="quarter">Last Quarter</option>
                  <option value="ytd">Year to Date</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              <div className="flex-center gap-2 ml-4 date-inputs-row">
                <input
                  id="analytics-start-date"
                  name="analyticsStartDate"
                  type="date"
                  aria-label="Start date"
                  autoComplete="off"
                  className="input-field small-date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDateRange('custom');
                  }}
                />
                <span className="text-secondary">to</span>
                <input
                  id="analytics-end-date"
                  name="analyticsEndDate"
                  type="date"
                  aria-label="End date"
                  autoComplete="off"
                  className="input-field small-date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDateRange('custom');
                  }}
                />
              </div>
            </div>

            <button className="btn-outline small flex-center gap-1" onClick={() => setShowPreferences(true)}>
              <Settings2 size={18} /> Customize View
            </button>

            <div className="dropdown-container">
              <button className="btn-primary flex-center gap-2" onClick={() => setExportRef(!exportRef)}>
                <Download size={18} /> Export <ChevronDown size={14} />
              </button>
              {exportRef && (
                <div className="dropdown-menu">
                  <button onClick={() => handleExport('csv')}>Summary Metrics (CSV)</button>
                  <button onClick={() => handleExport('pdf')}>PDF Summary Report</button>
                </div>
              )}
            </div>
          </div>
        }
      />

      {error && (
        <div className="alert alert-danger mb-4 flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading && !overview && (
        <div className="p-8 text-center text-secondary">
          <p>Loading analytics from database...</p>
        </div>
      )}

      {overview && widgetPrefs.showTopStats && (
        <>
          <div className="analytics-grid-4">
            <StatCard
              title="Gross Cash Collected"
              value={`₱${(overview.gross_cash_collected?.current || 0).toLocaleString()}`}
              change={cashDelta.text}
              trend={cashDelta.trend}
              icon={TrendingUp}
              tooltip="Sum of paid transactions in the reporting period. Click to view Reservations."
              drilldownTo="/reservations"
            />
            <StatCard
              title="Completed Booking Value"
              value={`₱${(overview.completed_booking_value?.current || 0).toLocaleString()}`}
              change={bookingDelta.text}
              trend={bookingDelta.trend}
              icon={ShoppingBag}
              tooltip="Sum of order values for reservations completed in the reporting period."
              drilldownTo="/reservations?status=Completed"
            />
            <StatCard
              title="Completed Bookings"
              value={overview.completed_reservations?.current || 0}
              change={completedResDelta.text}
              trend={completedResDelta.trend}
              icon={ShoppingBag}
              tooltip="Number of reservations completed in the reporting period."
              drilldownTo="/reservations?status=Completed"
            />
            <StatCard
              title="Unique Customers Served"
              value={overview.unique_customers_served?.current || 0}
              change={customerDelta.text}
              trend={customerDelta.trend}
              icon={Users}
              tooltip="Distinct customers with completed reservations in the period."
              drilldownTo="/customers"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <StatCard
              title="Cancellation Rate"
              value={cancellationRateDisplay.value}
              change={cancellationRateDisplay.text}
              trend={overview.cancellation_rate?.current > 0 ? 'down' : 'neutral'}
              icon={AlertTriangle}
              tooltip="Cancelled / (Completed + Cancelled) in this period."
              drilldownTo="/reservations?status=Cancelled"
            />
            <StatCard
              title="Pending Refund Liability"
              value={`₱${(overview.pending_refund_liability?.amount || 0).toLocaleString()}`}
              change={
                (overview.pending_refund_liability?.amount || 0) > 0
                  ? `⚠ ${overview.pending_refund_liability?.count || 0} booking(s) require refund`
                  : 'No pending refunds'
              }
              trend={(overview.pending_refund_liability?.amount || 0) > 0 ? 'down' : 'neutral'}
              icon={AlertCircle}
              tooltip="Paid payments on Cancelled reservations requiring refund. Click to review in Reservations."
              drilldownTo="/reservations?status=Cancelled"
              alertStyle={(overview.pending_refund_liability?.amount || 0) > 0 ? 'danger' : null}
            />
            <StatCard
              title="Average Product Rating"
              value={
                overview.customer_satisfaction?.average_rating !== null
                  ? `${overview.customer_satisfaction.average_rating} / 5`
                  : 'No ratings'
              }
              change={`${overview.customer_satisfaction?.review_count || 0} verified reviews`}
              trend="up"
              icon={Activity}
              tooltip="Average star rating across verified product reviews. Click to review in Reviews."
              drilldownTo="/reviews"
            />
          </div>
        </>
      )}

      <div className="analytics-layout mt-6">
        {/* Main Trends */}
        {widgetPrefs.showRevenueTrends && (
          <div className="card">
            <div className="card-header border-none flex-between">
              <h3>Reservation & Volume Trends</h3>
              <div className="badge accent">Daily (Asia/Manila)</div>
            </div>
            <div className="chart-container" style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={resAnalytics?.daily_trends || []}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--charcoal)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--charcoal)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="reservations" name="Total Booked" stroke="var(--charcoal)" strokeWidth={2} fillOpacity={1} fill="url(#colorRes)" />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke="#059669" strokeWidth={2} fillOpacity={1} fill="url(#colorComp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Category Share */}
        {widgetPrefs.showCategoryShare && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Completed Booking Value by Category</h3>
            </div>
            <div className="chart-container flex-center" style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={prodPerf?.category_distribution || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="category"
                  >
                    {(prodPerf?.category_distribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val) => `₱${Number(val).toLocaleString()}`} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div className="analytics-grid-3 mt-6">
        {/* Order Funnel / Status Breakdown */}
        <div className="card">
          <div className="card-header border-none">
            <h3>Reservation Status Breakdown</h3>
          </div>
          <div className="p-4 pt-0">
            {(resAnalytics?.status_breakdown || []).map((item, i) => (
              <div key={i} className="demo-bar-group mt-3">
                <div className="flex-between text-xs mb-1">
                  <span className="font-semibold">{item.status}</span>
                  <span>{item.count} bookings</span>
                </div>
                <div className="demo-bar">
                  <div
                    className="demo-fill"
                    style={{
                      width: `${Math.min(100, (item.count / Math.max(1, overview?.completed_reservations?.current + overview?.cancellation_rate?.current_cancelled || item.count)) * 100)}%`,
                      backgroundColor: COLORS[i % COLORS.length],
                    }}
                  ></div>
                </div>
              </div>
            ))}
            {(!resAnalytics?.status_breakdown || resAnalytics.status_breakdown.length === 0) && (
              <p className="text-xs text-secondary text-center py-4">No reservations in this period.</p>
            )}
          </div>
        </div>

        {/* Inventory Health - Variant Level */}
        <div className="card">
          <div className="card-header border-none flex-between">
            <h3>Inventory Health</h3>
            <span className="badge text-xs">Variant Cutoff ≤ {invHealth?.threshold || 2}</span>
          </div>
          <div className="flex-center flex-column gap-6 p-6">
            <div className="grid grid-cols-3 gap-4 w-full text-center">
              <div>
                <Link to="/inventory" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="stat-value small text-success cursor-pointer hover:underline">{invHealth?.in_stock_variants || 0}</div>
                  <div className="text-xs text-secondary font-bold uppercase tracking-wider">In Stock</div>
                </Link>
              </div>
              <div>
                <Link to="/inventory?stock=low" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="stat-value small text-warning cursor-pointer hover:underline">
                    {invHealth?.low_stock_variants || 0}
                  </div>
                  <div className="text-xs text-secondary font-bold uppercase tracking-wider">Low Stock</div>
                </Link>
              </div>
              <div>
                <Link to="/inventory?stock=out" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="stat-value small text-danger cursor-pointer hover:underline">
                    {invHealth?.out_of_stock_variants || 0}
                  </div>
                  <div className="text-xs text-secondary font-bold uppercase tracking-wider">Out of Stock</div>
                </Link>
              </div>
            </div>
            <div className="w-full">
              <div className="demo-bar-group">
                <div className="demo-bar">
                  <div
                    className="demo-fill"
                    style={{
                      width: `${Math.round(((invHealth?.in_stock_variants || 0) / Math.max(1, invHealth?.total_variants || 1)) * 100)}%`,
                      backgroundColor: 'var(--color-success)',
                    }}
                  ></div>
                </div>
              </div>
            </div>
            <div className="text-xs text-secondary text-center flex flex-column gap-1">
              <p>
                Total Variants: <span className="text-charcoal font-bold">{invHealth?.total_variants || 0}</span> ({invHealth?.available_units || 0} units available, {invHealth?.reserved_units || 0} reserved)
              </p>
              <p>
                Active Catalog: <span className="text-charcoal font-bold">{invHealth?.total_catalog_items || 0} products</span>
              </p>
            </div>
          </div>
        </div>

        {/* Top performing items */}
        {widgetPrefs.showTopItems && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Top Performing Items (Period)</h3>
            </div>
            <div className="table-container pt-0">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-center">Bookings</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(prodPerf?.top_performing_items || []).slice(0, 5).map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-sm flex items-center gap-2">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.product_name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                        ) : (
                          <Package size={20} className="text-secondary" />
                        )}
                        <span>{item.product_name}</span>
                      </td>
                      <td className="text-center text-sm">{item.completed_reservations}</td>
                      <td className="text-right font-bold text-sm">
                        ₱{Number(item.completed_booking_value || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {(!prodPerf?.top_performing_items || prodPerf.top_performing_items.length === 0) && (
                    <tr>
                      <td colSpan={3} className="text-center text-secondary py-4 text-xs">
                        No completed items in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="analytics-layout mt-6">
        {/* Most Wishlisted */}
        {widgetPrefs.showTopItems && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Most Wishlisted Items (Demand)</h3>
            </div>
            <div className="table-container pt-0">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">Wishlist Demand</th>
                  </tr>
                </thead>
                <tbody>
                  {(prodPerf?.most_wishlisted_items || []).slice(0, 5).map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-sm flex items-center gap-2">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.product_name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                        ) : (
                          <Package size={20} className="text-secondary" />
                        )}
                        <span>{item.product_name}</span>
                      </td>
                      <td className="text-sm text-secondary">{item.category || 'Uncategorized'}</td>
                      <td className="text-right font-bold text-sm text-secondary">
                        {item.wishlist_count}
                      </td>
                    </tr>
                  ))}
                  {(!prodPerf?.most_wishlisted_items || prodPerf.most_wishlisted_items.length === 0) && (
                    <tr>
                      <td colSpan={3} className="text-center text-secondary py-4 text-xs">
                        No wishlisted items recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Customer Cohort Metrics */}
        {widgetPrefs.showMetrics && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Customer Cohort Metrics</h3>
            </div>
            <div className="p-4 pt-0">
              <div className="metric-row">
                <div className="flex-between mb-1">
                  <span className="text-sm">New Registered Users</span>
                  <span className="font-bold">{cohortAnalytics?.new_registered_users || 0}</span>
                </div>
                <p className="text-xs text-secondary mb-4">Registered within the selected date range</p>
              </div>

              <div className="metric-row">
                <div className="flex-between mb-1">
                  <span className="text-sm">Unique Customers Served</span>
                  <span className="font-bold">{cohortAnalytics?.unique_customers_served || 0}</span>
                </div>
                <p className="text-xs text-secondary mb-4">Customers with completed bookings in period</p>
              </div>

              <div className="metric-row">
                <div className="flex-between mb-1">
                  <span className="text-sm">Returning Customers</span>
                  <span className="font-bold">{cohortAnalytics?.returning_customers || 0}</span>
                </div>
                <p className="text-xs text-secondary mb-4">Completed in period with a prior completed booking</p>
              </div>

              <div className="metric-row">
                <div className="flex-between mb-1">
                  <span className="text-sm">Returning Customer Rate</span>
                  <span className="font-bold">
                    {cohortAnalytics?.returning_customer_rate !== null && cohortAnalytics?.returning_customer_rate !== undefined
                      ? `${cohortAnalytics.returning_customer_rate}%`
                      : 'N/A'}
                  </span>
                </div>
                <p className="text-xs text-secondary">Returning customers / unique customers served</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preferences Modal */}
      {showPreferences && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowPreferences(false)}>
          <div className="modal-content" role="presentation" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Customize Analytics Dashboard</h2>
              <button className="close-btn" onClick={() => setShowPreferences(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="modal-body p-6">
              <p className="text-secondary mb-6 leading-relaxed">
                Choose which analytical sections you want to display on your view. Your choices are automatically saved locally.
              </p>

              <div className="form-group flex-between align-center p-4 border border-color rounded-xl mb-4" style={{ borderColor: 'var(--border-color)', borderRadius: '12px' }}>
                <div>
                  <h4 className="font-medium mb-1">Top Statistics</h4>
                  <p className="text-sm text-secondary">Summary cards for Gross Cash, Completed Booking Value, etc.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle Top Statistics">
                  <input
                    type="checkbox"
                    checked={widgetPrefs.showTopStats}
                    onChange={() => handleTogglePref('showTopStats')}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group flex-between align-center p-4 border border-color rounded-xl mb-4" style={{ borderColor: 'var(--border-color)', borderRadius: '12px' }}>
                <div>
                  <h4 className="font-medium mb-1">Trends Chart</h4>
                  <p className="text-sm text-secondary">Reservation volume and completion trends.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle Trends Chart">
                  <input
                    type="checkbox"
                    checked={widgetPrefs.showRevenueTrends}
                    onChange={() => handleTogglePref('showRevenueTrends')}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group flex-between align-center p-4 border border-color rounded-xl mb-4" style={{ borderColor: 'var(--border-color)', borderRadius: '12px' }}>
                <div>
                  <h4 className="font-medium mb-1">Category Breakdown</h4>
                  <p className="text-sm text-secondary">Pie chart showing category booking value distribution.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle Category Breakdown">
                  <input
                    type="checkbox"
                    checked={widgetPrefs.showCategoryShare}
                    onChange={() => handleTogglePref('showCategoryShare')}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group flex-between align-center p-4 border border-color rounded-xl mb-4" style={{ borderColor: 'var(--border-color)', borderRadius: '12px' }}>
                <div>
                  <h4 className="font-medium mb-1">Top Performing Items</h4>
                  <p className="text-sm text-secondary">Top completed booking items and wishlists.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle Top Performing Items">
                  <input
                    type="checkbox"
                    checked={widgetPrefs.showTopItems}
                    onChange={() => handleTogglePref('showTopItems')}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group flex-between align-center p-4 border border-color rounded-xl mb-4" style={{ borderColor: 'var(--border-color)', borderRadius: '12px' }}>
                <div>
                  <h4 className="font-medium mb-1">Customer Cohort Metrics</h4>
                  <p className="text-sm text-secondary">Breakdowns for Returning rates, unique customers, etc.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle Customer Metrics">
                  <input
                    type="checkbox"
                    checked={widgetPrefs.showMetrics}
                    onChange={() => handleTogglePref('showMetrics')}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;

