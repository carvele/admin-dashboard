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
import { Download, Calendar, TrendingUp, Users, ShoppingBag, Eye } from 'lucide-react';
import { subscribeToCollection } from '../../firebase/firestore';
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

  useEffect(() => {
    const unsubR = subscribeToCollection('reservations', setReservations);
    const unsubC = subscribeToCollection('users', (data) => {
      setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
    });
    const unsubCat = subscribeToCollection('products', setCatalog);
    const unsubConv = subscribeToCollection('analyticsConvRate', setConvRates);
    return () => {
      unsubR();
      unsubC();
      unsubCat();
      unsubConv();
    };
  }, []);

  // Compute total revenue purely from reservation data (Completed OR Confirmed)
  let totalRev = 0;
  const completedOrConfirmed = reservations.filter(
    (r) => r.status === 'Completed' || r.status === 'Confirmed' || r.status === 'Approved',
  );
  completedOrConfirmed.forEach((r) => {
    const item = catalog.find((c) => c.name === r.outfit);
    if (item) totalRev += item.price || 0;
  });

  // Compute month-over-month deltas
  const getMonthDelta = (list, dateField) => {
    const now = new Date();
    const thisMonth = list.filter((item) => {
      const d = new Date(
        item[dateField] || (item.createdAt?.seconds ? item.createdAt.seconds * 1000 : 0),
      );
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const lastMonth = list.filter((item) => {
      const d = new Date(
        item[dateField] || (item.createdAt?.seconds ? item.createdAt.seconds * 1000 : 0),
      );
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
    }).length;
    if (lastMonth === 0 && thisMonth === 0) return { text: 'No data yet', trend: 'neutral' };
    if (lastMonth === 0) return { text: `+${thisMonth} this month`, trend: 'up' };
    const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    return { text: `${pct >= 0 ? '+' : ''}${pct}% vs last month`, trend: pct >= 0 ? 'up' : 'down' };
  };

  const revDelta = getMonthDelta(completedOrConfirmed, 'date');
  const custDelta = getMonthDelta(customers, 'createdAt');
  const resDelta = getMonthDelta(reservations, 'date');

  const activeCustomers = customers.filter((c) => c.status === 'Active').length;
  // Compute popular items
  const outfitCounts = {};
  reservations.forEach((r) => {
    outfitCounts[r.outfit] = (outfitCounts[r.outfit] || 0) + 1;
  });
  const popularOutfits = Object.entries(outfitCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => {
      const item = catalog.find((c) => c.name === name);
      return { name, value: count, revenue: item ? item.price * count : 0 };
    });
  const actPopular =
    popularOutfits.length > 0 ? popularOutfits : [{ name: 'No data', value: 0, revenue: 0 }];

  const sortedConvRates = [...convRates].sort((a, b) => (a.id > b.id ? 1 : -1));

  // Build dynamic trends from actual reservation data
  const buildTrends = () => {
    const now = new Date();
    if (dateRange === '30d') {
      // Group by week of the month
      const weeks = { 'Week 1': 0, 'Week 2': 0, 'Week 3': 0, 'Week 4': 0 };
      reservations.forEach((r) => {
        if (r.date || r.createdAt) {
          const d = new Date(
            r.date || (r.createdAt?.seconds ? r.createdAt.seconds * 1000 : r.createdAt),
          );
          const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
          if (diffDays <= 30) {
            const weekNum = Math.min(Math.floor(diffDays / 7) + 1, 4);
            weeks[`Week ${weekNum}`] = (weeks[`Week ${weekNum}`] || 0) + 1;
          }
        }
      });
      return Object.entries(weeks).map(([name, reservations]) => ({ name, reservations }));
    } else if (dateRange === 'quarter') {
      const months = {};
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      for (let i = 2; i >= 0; i--) {
        const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months[monthNames[m.getMonth()]] = 0;
      }
      reservations.forEach((r) => {
        if (r.date || r.createdAt) {
          const d = new Date(
            r.date || (r.createdAt?.seconds ? r.createdAt.seconds * 1000 : r.createdAt),
          );
          const mName = monthNames[d.getMonth()];
          if (months[mName] !== undefined) months[mName]++;
        }
      });
      return Object.entries(months).map(([name, reservations]) => ({ name, reservations }));
    } else {
      const quarters = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
      reservations.forEach((r) => {
        if (r.date || r.createdAt) {
          const d = new Date(
            r.date || (r.createdAt?.seconds ? r.createdAt.seconds * 1000 : r.createdAt),
          );
          const q = Math.floor(d.getMonth() / 3) + 1;
          quarters[`Q${q}`]++;
        }
      });
      return Object.entries(quarters).map(([name, reservations]) => ({ name, reservations }));
    }
  };
  const reservationTrends = buildTrends();

  const handleExportCSV = () => {
    if (reservations.length === 0) return;
    const headers = ['ID', 'Customer', 'Outfit', 'Size', 'Date', 'Status', 'Total Price'];
    const csvContent = [
      headers.join(','),
      ...reservations.map((r) =>
        [
          r.id || '',
          `"${r.customer || ''}"`,
          `"${r.outfit || ''}"`,
          r.size || '',
          r.date ? new Date(r.date).toLocaleDateString() : '',
          r.status || '',
          catalog.find((c) => c.name === r.outfit)?.price || 0,
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
          <button className="btn-primary flex-center gap-2" onClick={handleExportCSV}>
            <Download size={18} /> Export Report
          </button>
        </div>
      </div>

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

      <div className="analytics-layout mt-4">
        {/* Main Chart */}
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

        {/* Conversion Chart */}
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
      </div>

      <div className="analytics-layout mt-4">
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
      </div>
    </div>
  );
};

export default Analytics;
