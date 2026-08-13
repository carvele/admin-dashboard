import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Download, Calendar, TrendingUp, Users, ShoppingBag, Settings2, X, ChevronDown, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { subscribeToCollection } from '../../lib/supabaseService';
import { exportGarmentPerformanceReport, exportInventoryDepreciationReport } from '../../utils/reportExporter';
import { countsAsRevenue } from '../../utils/reservationStatus';
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
  const [arLogs, setArLogs] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [poseGuides, setPoseGuides] = useState([]);
  
  // Filter state
  const [dateRange, setDateRange] = useState('30d');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
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
      showARConversions: true,
      showCategoryShare: true,
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
    const unsubR = subscribeToCollection('reservations', setReservations, {}, true);
    const unsubC = subscribeToCollection('profiles', (data) => {
      setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
    });
    const unsubCat = subscribeToCollection('products', setCatalog, {}, true);
    const unsubAR = subscribeToCollection('ar_sessions', setArLogs);
    const unsubFeed = subscribeToCollection('feedback', setFeedback, {}, true);
    const unsubPoses = subscribeToCollection('pose_guides', setPoseGuides);

    return () => {
      unsubR();
      unsubC();
      unsubCat();
      unsubAR();
      unsubFeed();
      unsubPoses();
    };
  }, []);

  const handleDatePresetChange = (preset) => {
    setDateRange(preset);
    const now = new Date();
    let start = new Date();
    
    if (preset === '7d') start.setDate(now.getDate() - 7);
    else if (preset === '30d') start.setDate(now.getDate() - 30);
    else if (preset === 'quarter') start.setMonth(now.getMonth() - 3);
    else if (preset === 'ytd') start = new Date(now.getFullYear(), 0, 1);
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
  };

  const parseResDate = (item, overrideField = null) => {
    const raw = overrideField ? item[overrideField] : (item.reservationDate || item.date || item.timestamp || item.createdAt || item.joinedAt);
    if (!raw) return null;
    // Supabase returns ISO strings; legacy Firestore may have .toDate() or .seconds
    if (raw?.toDate) return raw.toDate();
    if (raw?.seconds) return new Date(raw.seconds * 1000);
    return new Date(raw);
  };

  const isInRange = (date) => {
    if (!date) return false;
    const d = new Date(date);
    const s = new Date(startDate);
    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);
    return d >= s && d <= e;
  };

  // Filter Data
  const filteredReservations = useMemo(
    () => reservations.filter(r => isInRange(parseResDate(r))),
    [reservations, startDate, endDate]
  );
  const filteredCustomers = useMemo(
    () => customers.filter(c => isInRange(parseResDate(c))),
    [customers, startDate, endDate]
  );
  const currentTotalCustomers = customers.length; // Absolute total

  // Compute Revenue and Growth
  //
  // Revenue is recognised at handover, matching reservationStatus.js's
  // countsAsRevenue (Completed only) -- this used to hand-roll its own list
  // that counted every in-progress status as revenue, including reservations
  // still awaiting payment. That inflated "Total Revenue" with money that had
  // neither been earned nor received, and drifted further out of date with
  // every status-vocabulary change since it never imported the shared
  // definition other pages already use.
  const { totalRev, earnedReservations } = useMemo(() => {
    let rev = 0;
    const list = filteredReservations.filter((r) => countsAsRevenue(r));
    list.forEach((r) => {
      const outfitName = r.productName || r.outfit;
      const item = catalog.find((c) => c.id === r.productId || c.name === outfitName);
      if (item) {
        rev += Number(item.price) || 0;
      } else {
        rev += Number(r.price) || Number(r.totalAmount) || Number(r.rentalFee) || Number(r.rentalPrice) || 0;
      }
    });
    return { totalRev: rev, earnedReservations: list };
  }, [filteredReservations, catalog]);

  const getGrowth = (list, dateField = null) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end - start;
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = new Date(start.getTime() - 1);

    const isPrevRange = (date) => {
      const d = new Date(date);
      return d >= prevStart && d <= prevEnd;
    };

    const currentCount = list.filter(item => isInRange(parseResDate(item, dateField))).length;
    const prevCount = list.filter(item => isPrevRange(parseResDate(item, dateField))).length;

    if (prevCount === 0) return { text: `+${currentCount} this period`, trend: 'up' };
    const pct = Math.round(((currentCount - prevCount) / prevCount) * 100);
    return { text: `${pct >= 0 ? '+' : ''}${pct}% vs prev period`, trend: pct >= 0 ? 'up' : 'down' };
  };

  const revDelta = useMemo(() => getGrowth(earnedReservations), [earnedReservations, startDate, endDate]);
  const custDelta = useMemo(() => getGrowth(customers), [customers, startDate, endDate]);
  const resDelta = useMemo(() => getGrowth(reservations), [reservations, startDate, endDate]);

  // New Visualization: Revenue by Category
  const categoryShareData = useMemo(() => {
    const categoryRev = {};
    earnedReservations.forEach(r => {
      const outfitName = r.productName || r.outfit;
      const item = catalog.find(c => c.name === outfitName || c.id === r.productId);
      const cat = item?.category || 'Uncategorized';
      const val = r.price || r.totalAmount || r.rentalFee || item?.price || 0;
      categoryRev[cat] = (categoryRev[cat] || 0) + val;
    });

    return Object.entries(categoryRev)
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value);
  }, [earnedReservations, catalog]);

  const COLORS = ['#1F2937', '#D97706', '#92400E', '#4B5563', '#9CA3AF'];

  // Status Funnel
  const funnelData = useMemo(() => {
    const statusCounts = {};
    filteredReservations.forEach(r => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });
    return Object.entries(statusCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a,b) => b.count - a.count);
  }, [filteredReservations]);

  // Avg Rating
  const avgRating = useMemo(() => {
    return feedback.length > 0 
      ? (feedback.reduce((acc, f) => acc + (f.rating || 0), 0) / feedback.length).toFixed(1)
      : 0;
  }, [feedback]);

  // Inventory Health - Active items only
  const activeCatalog = catalog.filter(p => p.deleted !== true);
  const inStock = activeCatalog.filter(p => (p.stock || 0) > 0).length;
  const outOfStock = activeCatalog.filter(p => (p.stock || 0) <= 0).length;

  // Build dynamic trends from actual reservation data
  const buildTrends = () => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diffDays = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 14) {
      // Day by day
      const days = {};
      for(let i=0; i <= diffDays; i++) {
        const d = new Date(s);
        d.setDate(s.getDate() + i);
        days[d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })] = 0;
      }
      filteredReservations.forEach(r => {
        const d = parseResDate(r);
        const k = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if(days[k] !== undefined) days[k]++;
      });
      return Object.entries(days).map(([name, reservations]) => ({ name, reservations }));
    } else {
      // Group by weeks or months
      const weeks = {};
      filteredReservations.forEach(r => {
        const d = parseResDate(r);
        const weekNum = `Week ${Math.ceil((d - s) / (1000 * 60 * 60 * 24 * 7)) || 1}`;
        weeks[weekNum] = (weeks[weekNum] || 0) + 1;
      });
      return Object.entries(weeks).map(([name, reservations]) => ({ name, reservations }));
    }
  };
  const reservationTrends = buildTrends();

  // Compute popular items for the selected range
  const outfitCounts = {};
  filteredReservations.forEach((r) => {
    const key = r.productName || r.outfit;
    if (key) outfitCounts[key] = (outfitCounts[key] || 0) + 1;
  });
  const popularOutfits = Object.entries(outfitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => {
      const item = catalog.find((c) => c.name === name);
      return { 
        name, 
        value: count, 
        revenue: (item?.price || 0) * count, 
        category: item?.category || '' 
      };
    });

  const handleExport = (type) => {
    if (reservations.length === 0) return;
    
    const data = filteredReservations.map(r => ({
      ID: r.id || '',
      Customer: r.customerName || r.customer || '',
      Product: r.productName || r.outfit || '',
      Size: r.size || '',
      Date: parseResDate(r)?.toLocaleDateString() || '',
      Status: r.status || '',
      Price: r.rentalPrice || r.price || r.totalAmount || 0
    }));

    if (type === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reservations");
      XLSX.writeFile(wb, `JezSy_Report_${startDate}_to_${endDate}.xlsx`);
    } else if (type === 'pdf') {
      const doc = new jsPDF();
      doc.text("JezSy Collection Analytics Report", 14, 15);
      doc.text(`Period: ${startDate} to ${endDate}`, 14, 25);
      
      const tableColumn = ["Customer", "Product", "Date", "Status", "Price"];
      const tableRows = data.map(r => [r.Customer, r.Product, r.Date, r.Status, `P${r.Price}`]);
      
      doc.autoTable(tableColumn, tableRows, { startY: 30 });
      doc.save(`JezSy_Report_${startDate}_to_${endDate}.pdf`);
    } else {
      // Default CSV
      const headers = Object.keys(data[0]);
      const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h]}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `JezSy_Report_${startDate}.csv`;
      link.click();
    }
    setExportRef(false);
  };

  // Dynamic AR Conversions
  const dynamicConvRates = (() => {
    const months = {};
    // Group tryOns
    arLogs.forEach(log => {
      const d = parseResDate(log);
      if(!d) return;
      const m = d.toLocaleDateString('en-US', { month: 'short' });
      if(!months[m]) months[m] = { month: m, tryOn: 0, reserved: 0, _date: d };
      months[m].tryOn++;
    });
    // Group reservations
    reservations.forEach(r => {
      const d = parseResDate(r);
      if(!d) return;
      const m = d.toLocaleDateString('en-US', { month: 'short' });
      if(!months[m]) months[m] = { month: m, tryOn: 0, reserved: 0, _date: d };
      months[m].reserved++;
    });
    
    // Sort chronologically and return
    return Object.values(months)
      .sort((a, b) => a._date - b._date)
      .slice(-6); // last 6 months
  })();

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Analytics Dashboard</h1>
          <p className="page-subtitle">Comprehensive performance metrics for JezSy Collection</p>
        </div>
        <div className="flex-center gap-3">
          <div className="date-picker-group">
            <div className="search-box">
              <Calendar size={18} className="search-icon" />
              <select
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
            
            <div className="flex-center gap-2 ml-4">
              <input 
                type="date" 
                className="input-field small-date" 
                value={startDate} 
                onChange={(e) => { setStartDate(e.target.value); setDateRange('custom'); }}
              />
              <span className="text-secondary">to</span>
              <input 
                type="date" 
                className="input-field small-date" 
                value={endDate} 
                onChange={(e) => { setEndDate(e.target.value); setDateRange('custom'); }}
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
                <button onClick={() => handleExport('csv')}>Revenue Summary (CSV)</button>
                <button onClick={() => handleExport('xlsx')}>Revenue Summary (.xlsx)</button>
                <button onClick={() => handleExport('pdf')}>PDF Summary Report</button>
                <hr style={{ margin: '4px 0', borderColor: 'var(--border-color, #333)' }} />
                <button onClick={() => { exportGarmentPerformanceReport(catalog, reservations); setExportRef(false); }}>
                  👗 Garment Performance (CSV)
                </button>
                <button onClick={() => { exportInventoryDepreciationReport(catalog, reservations); setExportRef(false); }}>
                  📊 Depreciation & ROI (CSV)
                </button>
              </div>
            )}
          </div>
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
            tooltip={`Earned revenue from ${earnedReservations.length} completed reservation(s) in this period.`}
          />
          <StatCard
            title="Total Customers"
            value={currentTotalCustomers}
            change={custDelta.text}
            trend={custDelta.trend}
            icon={Users}
            tooltip={`${custDelta.text} within the selected range.`}
          />
          <StatCard
            title="Reservations"
            value={filteredReservations.length}
            change={resDelta.text}
            trend={resDelta.trend}
            icon={ShoppingBag}
            tooltip={`Total bookings in this period.`}
          />
          <StatCard
            title="Customer Satisfaction"
            value={`${avgRating} / 5`}
            change={`${feedback.length} reviews`}
            trend="up"
            icon={Activity}
          />
        </div>
      )}

      <div className="analytics-layout mt-6">
        {/* Main Trends */}
        {widgetPrefs.showRevenueTrends && (
          <div className="card">
            <div className="card-header border-none flex-between">
              <h3>Reservation & Growth Trends</h3>
              <div className="badge accent">Daily Volume</div>
            </div>
            <div className="chart-container" style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={reservationTrends}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1F2937" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#1F2937" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="reservations" stroke="#1F2937" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRes)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Category Share */}
        {widgetPrefs.showCategoryShare && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Revenue by Category</h3>
            </div>
            <div className="chart-container flex-center" style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryShareData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryShareData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(val) => `₱${val.toLocaleString()}`} />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div className="analytics-grid-3 mt-6">
        {/* Order Funnel */}
        <div className="card">
          <div className="card-header border-none">
             <h3>Reservation Status Breakdown</h3>
          </div>
          <div className="p-4 pt-0">
             {funnelData.map((item, i) => (
               <div key={i} className="demo-bar-group mt-3">
                 <div className="flex-between text-xs mb-1">
                   <span className="font-semibold">{item.name}</span>
                   <span>{item.count} orders</span>
                 </div>
                 <div className="demo-bar">
                   <div 
                    className="demo-fill" 
                    style={{ 
                      width: `${(item.count / filteredReservations.length) * 100}%`,
                      backgroundColor: COLORS[i % COLORS.length]
                    }}
                    ></div>
                 </div>
               </div>
             ))}
          </div>
        </div>

        {/* Inventory Health */}
        <div className="card">
           <div className="card-header border-none">
             <h3>Inventory Health</h3>
           </div>
           <div className="flex-center flex-column gap-6 p-6">
              <div className="flex-center gap-10">
                <div className="text-center">
                   <div className="stat-value small text-success">{inStock}</div>
                   <div className="text-xs text-secondary font-bold uppercase tracking-wider">In Stock</div>
                </div>
                <div className="text-center">
                   <div className="stat-value small text-danger">{outOfStock}</div>
                   <div className="text-xs text-secondary font-bold uppercase tracking-wider">Out of Stock</div>
                </div>
              </div>
              <div className="demo-bar-group">
                 <div className="demo-bar">
                   <div className="demo-fill" style={{ width: `${(inStock / (activeCatalog.length || 1)) * 100}%`, backgroundColor: '#059669' }}></div>
                 </div>
              </div>
              <p className="text-xs text-secondary text-center">
                Total Catalog size: <span className="text-charcoal font-bold">{activeCatalog.length} items</span>
              </p>
           </div>
        </div>

        {/* Top performing items */}
        {widgetPrefs.showTopItems && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Top Performing Items</h3>
            </div>
            <div className="table-container pt-0">
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(popularOutfits.length > 0 ? popularOutfits : []).slice(0, 5).map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-medium text-sm">{item.name}</td>
                      <td className="text-right font-bold text-sm">
                        ₱{(item.revenue || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="analytics-layout mt-6">
        {/* AR Conversions */}
        {widgetPrefs.showARConversions && (
          <div className="card">
            <div className="card-header border-none">
              <h3>AR Try-On Performance</h3>
            </div>
            <div className="chart-container" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dynamicConvRates} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="tryOn" name="AR Try-Ons" fill="#1F2937" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="reserved" name="Reservations" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="p-4 border-t mt-2">
              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-700 mb-3">Top Style Poses (Engagement)</h4>
              <div className="space-y-2">
                {poseGuides.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-7 h-9 object-cover rounded" />
                      ) : (
                        <div className="w-7 h-9 bg-slate-800 rounded flex items-center justify-center text-[10px] text-white">📸</div>
                      )}
                      <div>
                        <p className="font-bold text-gray-900">{p.name}</p>
                        <p className="text-[10px] text-gray-500">{p.occasion || 'General'} · {p.difficulty || 'Easy'}</p>
                      </div>
                    </div>
                    <span className="font-mono text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded text-[11px]">
                      {p.category || 'Style Hint'}
                    </span>
                  </div>
                ))}
                {poseGuides.length === 0 && (
                  <p className="text-xs text-gray-400">No style pose activity recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Customer Engagement Metrics */}
        {widgetPrefs.showMetrics && (
          <div className="card">
            <div className="card-header border-none">
              <h3>Platform Metrics</h3>
            </div>
            <div className="p-4 pt-0">
              <div className="metric-row">
                 <div className="flex-between mb-1">
                   <span className="text-sm">New Registered Users</span>
                   <span className="font-bold">{filteredCustomers.length}</span>
                 </div>
                 <p className="text-xs text-secondary mb-4">{custDelta.text}</p>
              </div>
              
              <div className="metric-row">
                 <div className="flex-between mb-1">
                   <span className="text-sm">Returning Customer Rate</span>
                   <span className="font-bold">
                    {filteredCustomers.length > 0 
                      ? Math.round((filteredReservations.length / filteredCustomers.length) * 10) 
                      : 0}%
                   </span>
                 </div>
                 <div className="demo-bar"><div className="demo-fill" style={{ width: '45%', backgroundColor: '#D97706' }}></div></div>
              </div>

              <div className="metric-row mt-6">
                 <div className="flex-between mb-1">
                   <span className="text-sm">Avg Reservation Value</span>
                   <span className="font-bold">₱{ (totalRev / (earnedReservations.length || 1)).toLocaleString() }</span>
                 </div>
                 <div className="demo-bar"><div className="demo-fill" style={{ width: '70%', backgroundColor: '#1F2937' }}></div></div>
              </div>
            </div>
          </div>
        )}
      </div>

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
                  <h4 className="font-medium mb-1">Category Breakdown</h4>
                  <p className="text-sm text-secondary">Pie chart showing category profit distribution.</p>
                </div>
                <label className="toggle-switch">
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
