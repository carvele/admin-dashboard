import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { Download, Calendar, TrendingUp, Users, ShoppingBag, Eye, Settings2, X } from 'lucide-react';
import { subscribeToCollection, orderBy, limit } from '../../firebase/firestore';
import './Analytics.css';

const StatCard = ({ title, value, change, icon: Icon, trend, tooltip }) => (
  <div className="card stat-card" title={tooltip || ''}>
    <div className="stat-header">
      <div className="stat-title">{title}</div>
      <div
        className={`stat-icon ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : ''}`}
      >
        <Icon size={20} />
      </div>
    </div>
    <div className="stat-value">{value}</div>
    <div
      className={`stat-change ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-secondary'}`}
    >
      {trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''} {change}
    </div>
  </div>
);

const Analytics = () => {
  const [reservations, setReservations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [convRates, setConvRates] = useState([]);
  // Filter state
  const [dateRange, setDateRange] = useState('30d');
  const [showPreferences, setShowPreferences] = useState(false);
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
      showARConversions: true,
      showTopItems: true,
      showMetrics: true,
    };
  });

  // Save prefs to local storage automatically
  useEffect(() => {
    localStorage.setItem('analytics_widget_prefs', JSON.stringify(widgetPrefs));
  }, [widgetPrefs]);
  
  const handleTogglePref = (key) => {
    setWidgetPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    // Reservations come from BOTH admin dashboard (has createdAt) and Android app (may use
    // timestamp/reservationDate instead). Using orderBy('createdAt') would silently exclude
    // any doc without that field, so we use limit-only for reservations.
    const reservationConstraint = [limit(500)];
    // Users: Android-registered users may lack createdAt, so use limit-only to avoid silent exclusions.
    const userConstraint = [limit(500)];
    // Products are always created via addDocument so createdAt is guaranteed.
    const productConstraint = [orderBy('createdAt', 'desc'), limit(500)];

    const unsubR = subscribeToCollection('reservations', setReservations, reservationConstraint);
    const unsubC = subscribeToCollection('users', (data) => {
      setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
    }, userConstraint);
    const unsubCat = subscribeToCollection('products', setCatalog, productConstraint);
    const unsubConv = subscribeToCollection('analyticsConvRate', setConvRates, [limit(100)]);
    
    return () => {
      unsubR();
      unsubC();
      unsubCat();
      unsubConv();
    };
  }, []);

  // Compute total revenue — Completed / Confirmed / Approved reservations / To Pay
  let totalRev = 0;
  const completedOrConfirmed = reservations.filter(
    (r) => r.status === 'Completed' || r.status === 'Confirmed' || r.status === 'Approved' || r.status === 'To Pickup' || r.status === 'Active' || r.status === 'To Pay',
  );
  completedOrConfirmed.forEach((r) => {
    const outfitName = r.productName || r.outfit;
    // 1. Try catalog lookup (exact doc id match, then name match)
    const item = catalog.find((c) => c.id === r.productId || c.name === outfitName);
    if (item) {
      totalRev += item.price || 0;
    } else {
      // 2. Fallback: price stored directly on the reservation (Android app stores this)
      totalRev += r.price || r.totalAmount || r.rentalFee || 0;
    }
  });

  // Unified date parser — covers both admin (reservationDate as Date/Timestamp) and
  // Android (reservationDate as Timestamp, date as string, timestamp as millis)
  const parseResDate = (r) => {
    const raw = r.reservationDate || r.date || r.timestamp || r.createdAt;
    if (!raw) return null;
    if (raw?.toDate) return raw.toDate();               // Firestore Timestamp
    if (raw?.seconds) return new Date(raw.seconds * 1000); // Firestore Timestamp (plain object)
    return new Date(raw);                               // ISO string or millis
  };

  const getMonthDelta = (list, dateField, useResParser = false) => {
    const now = new Date();
    const getDate = (item) => {
      if (useResParser) return parseResDate(item);
      const raw = item[dateField];
      if (!raw) return null;
      if (raw?.toDate) return raw.toDate();
      if (raw?.seconds) return new Date(raw.seconds * 1000);
      return new Date(raw);
    };
    const thisMonth = list.filter((item) => {
      const d = getDate(item);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const lastMonth = list.filter((item) => {
      const d = getDate(item);
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d && d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
    }).length;
    if (lastMonth === 0 && thisMonth === 0) return { text: 'No data yet', trend: 'neutral' };
    if (lastMonth === 0) return { text: `+${thisMonth} this month`, trend: 'up' };
    const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    return { text: `${pct >= 0 ? '+' : ''}${pct}% vs last month`, trend: pct >= 0 ? 'up' : 'down' };
  };

  const revDelta = getMonthDelta(completedOrConfirmed, null, true);
  const custDelta = getMonthDelta(customers, 'createdAt');
  const resDelta = getMonthDelta(reservations, null, true);

  const activeCustomers = customers.filter((c) => c.status === 'Active').length;
  // Compute popular items — normalise outfit name across both field names
  const outfitCounts = {};
  reservations.forEach((r) => {
    const key = r.productName || r.outfit;
    if (key) outfitCounts[key] = (outfitCounts[key] || 0) + 1;
  });
  const popularOutfits = Object.entries(outfitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => {
      const item = catalog.find((c) => c.name === name);
      return { name, value: count, revenue: item ? item.price * count : 0, category: item?.category || '' };
    });
  const actPopular =
    popularOutfits.length > 0 ? popularOutfits : [{ name: 'No data', value: 0, revenue: 0 }];

  const sortedConvRates = [...convRates].sort((a, b) => (a.id > b.id ? 1 : -1));

  // Build dynamic trends from actual reservation data
  const buildTrends = () => {
    const now = new Date();
    if (dateRange === '30d') {
      const weeks = { 'Week 1': 0, 'Week 2': 0, 'Week 3': 0, 'Week 4': 0 };
      reservations.forEach((r) => {
        const d = parseResDate(r);
        if (!d) return;
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) {
          const weekNum = Math.min(Math.floor(diffDays / 7) + 1, 4);
          weeks[`Week ${weekNum}`] = (weeks[`Week ${weekNum}`] || 0) + 1;
        }
      });
      return Object.entries(weeks).map(([name, reservations]) => ({ name, reservations }));
    } else if (dateRange === 'quarter') {
      const months = {};
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (let i = 2; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months[monthNames[m.getMonth()]] = 0;
      }
      reservations.forEach((r) => {
        const d = parseResDate(r);
        if (!d) return;
        const mName = monthNames[d.getMonth()];
        if (months[mName] !== undefined) months[mName]++;
      });
      return Object.entries(months).map(([name, reservations]) => ({ name, reservations }));
    } else {
      const quarters = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      reservations.forEach((r) => {
        const d = parseResDate(r);
        if (!d) return;
        const q = Math.floor(d.getMonth() / 3) + 1;
        quarters[`Q${q}`]++;
      });
      return Object.entries(quarters).map(([name, reservations]) => ({ name, reservations }));
    }
  };
  const reservationTrends = buildTrends();

  const handleExportCSV = () => {
    if (reservations.length === 0) return;
    const headers = ['ID', 'Customer', 'Product', 'Size', 'Date', 'Status', 'Rental Price'];
    const csvContent = [
      headers.join(','),
      ...reservations.map((r) =>
        [
          r.id || '',
          `"${r.customerName || r.customer || ''}"`,
          `"${r.productName || r.outfit || ''}"`,
          r.size || '',
          (() => {
            const d = parseResDate(r);
            return d ? d.toLocaleDateString() : '';
          })(),
          r.status || '',
          r.rentalPrice || r.price || r.totalAmount || r.rentalFee ||
            catalog.find((c) => c.name === (r.productName || r.outfit))?.price || 0,
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `reservations_export_${new Date().toISOString().split('T')[0]}.csv`,
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Analytics Dashboard</h1>
          <p className="page-subtitle">Comprehensive performance metrics for JezSy Collection</p>
        </div>
        <div className="flex-center gap-3">
          <div className="search-box">
            <Calendar size={18} className="search-icon" />
            <select
              className="input-field pl-10 bg-transparent border-none font-medium"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="30d">Last 30 Days</option>
              <option value="quarter">Last Quarter</option>
              <option value="ytd">Year to Date</option>
            </select>
          </div>
          <button className="btn-outline small flex-center gap-1" onClick={() => setShowPreferences(true)}>
            <Settings2 size={18} /> Customize View
          </button>
          <button className="btn-primary flex-center gap-2" onClick={handleExportCSV}>
            <Download size={18} /> Export Report
          </button>
        </div>
      </div>

      {widgetPrefs.showTopStats && (
        <div className="analytics-grid-4">
          <StatCard
            title="Total Revenue"
            value={`₱${totalRev.toLocaleString()}`}
            change={revDelta.text}
            trend={revDelta.trend}
            icon={TrendingUp}
            tooltip={`Derived from ${completedOrConfirmed.length} completed/confirmed reservations`}
          />
          <StatCard
            title="New Customers"
            value={customers.length || 0}
            change={custDelta.text}
            trend={custDelta.trend}
            icon={Users}
            tooltip={`${customers.length} registered customers`}
          />
          <StatCard
            title="Reservations"
            value={reservations.length || 0}
            change={resDelta.text}
            trend={resDelta.trend}
            icon={ShoppingBag}
            tooltip={`${reservations.length} total reservations`}
          />
          <StatCard
            title="AR Try-Ons"
            value={catalog.filter((p) => p.tags && p.tags.includes('AR Try-On')).length}
            change={`${catalog.filter((p) => p.tags && p.tags.includes('AR Try-On')).length} products`}
            trend="up"
            icon={Eye}
          />
        </div>
      )}

      {(widgetPrefs.showRevenueTrends || widgetPrefs.showARConversions) && (
        <div className="analytics-layout mt-4" style={{ gridTemplateColumns: widgetPrefs.showRevenueTrends && widgetPrefs.showARConversions ? '2fr 1fr' : '1fr' }}>
        {/* Main Chart */}
        {widgetPrefs.showRevenueTrends && (
          <div className="card analytics-main-chart">
            <div className="card-header border-none">
              <h3>Reservation & Revenue Trends</h3>
            </div>
            <div className="chart-container" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={reservationTrends}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="reservations"
                    stroke="var(--accent)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorRes)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Conversion Chart */}
        {widgetPrefs.showARConversions && (
          <div className="card">
            <div className="card-header border-none">
              <h3>AR Try-On vs Conversions</h3>
            </div>
            <div className="chart-container" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedConvRates} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                  <RechartsTooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    }}
                  />
                  <Legend iconType="circle" />
                  <Bar
                    dataKey="tryOn"
                    name="AR Try-Ons"
                    fill="var(--charcoal)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="reserved"
                    name="Reservations"
                    fill="var(--beige)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
      )}

      {(widgetPrefs.showTopItems || widgetPrefs.showMetrics) && (
        <div className="analytics-layout mt-4" style={{ gridTemplateColumns: widgetPrefs.showTopItems && widgetPrefs.showMetrics ? '2fr 1fr' : '1fr' }}>
        {widgetPrefs.showTopItems && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Top Performing Items</h3>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {actPopular.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium">{item.name}</td>
                      <td className="text-secondary">{item.category || 'Uncategorized'}</td>
                      <td className="text-right font-medium">
                        ₱{(item.revenue || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {widgetPrefs.showMetrics && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Customer & Reservation Metrics</h3>
            </div>
            <div className="p-4 pt-0">
              <div className="demo-bar-group">
                <div className="flex-between text-sm mb-1">
                  <span>New vs Returning Customers</span>
                  <span className="font-medium">
                    {customers.length > 0
                      ? Math.round(
                          ((customers.length - Object.keys(outfitCounts).length) / customers.length) *
                            100,
                        ) || 50
                      : 0}
                    % /
                    {customers.length > 0
                      ? Math.round((Object.keys(outfitCounts).length / customers.length) * 100) || 50
                      : 0}
                    %
                  </span>
                </div>
                <div className="demo-bar">
                  <div
                    className="demo-fill"
                    style={{
                      width: `${customers.length > 0 ? Math.round(((customers.length - Object.keys(outfitCounts).length) / customers.length) * 100) || 50 : 50}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  ></div>
                </div>
              </div>
              <div className="demo-bar-group mt-4">
                <div className="flex-between text-sm mb-1">
                  <span>Completed Reservation Rate</span>
                  <span className="font-medium">
                    {reservations.length > 0
                      ? Math.round(
                          (reservations.filter((r) => r.status === 'Completed').length /
                            reservations.length) *
                            100,
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="demo-bar">
                  <div
                    className="demo-fill"
                    style={{
                      width: `${reservations.length > 0 ? Math.round((reservations.filter((r) => r.status === 'Completed').length / reservations.length) * 100) : 0}%`,
                      backgroundColor: 'var(--charcoal)',
                    }}
                  ></div>
                </div>
              </div>
              <div className="demo-bar-group mt-4">
                <div className="flex-between text-sm mb-1">
                  <span>Active Customer Growth</span>
                  <span className="font-medium">
                    {customers.length > 0
                      ? Math.round((activeCustomers / customers.length) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="demo-bar">
                  <div
                    className="demo-fill"
                    style={{
                      width: `${customers.length > 0 ? Math.round((activeCustomers / customers.length) * 100) : 0}%`,
                      backgroundColor: '#D97706',
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Analytics Preferences Modal */}
      {showPreferences && (
        <div className="modal-overlay" onClick={() => setShowPreferences(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
                  <p className="text-sm text-secondary">Summary cards for Revenue, Customers, etc.</p>
                </div>
                <label className="toggle-switch">
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
                  <p className="text-sm text-secondary">Reservation & Revenue area trends.</p>
                </div>
                <label className="toggle-switch">
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
                  <h4 className="font-medium mb-1">Conversion Chart</h4>
                  <p className="text-sm text-secondary">AR Try-On vs Reservation comparisons.</p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={widgetPrefs.showARConversions}
                    onChange={() => handleTogglePref('showARConversions')}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group flex-between align-center p-4 border border-color rounded-xl mb-4" style={{ borderColor: 'var(--border-color)', borderRadius: '12px' }}>
                <div>
                  <h4 className="font-medium mb-1">Top Performing Items</h4>
                  <p className="text-sm text-secondary">Table showing the most generated revenue list.</p>
                </div>
                <label className="toggle-switch">
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
                  <h4 className="font-medium mb-1">Customer Metrics</h4>
                  <p className="text-sm text-secondary">Breakdowns for Returning rates, Active growth, etc.</p>
                </div>
                <label className="toggle-switch">
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
