import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, Users, Shirt, Activity, Clock, AlertTriangle, TrendingUp, RefreshCw, CheckCircle2 } from 'lucide-react';
import { subscribeToCollection } from '../firebase/firestore';
import { motion } from 'framer-motion';
import './Dashboard.css';

const COLORS = ['#8B6F5C', '#C9BEB4', '#E8DDD3', '#2C2C2C'];

const Dashboard = () => {
  const [reservations, setReservations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [trendFilter, setTrendFilter] = useState('This Week');
  const [lastSynced, setLastSynced] = useState(new Date());

  React.useEffect(() => {
    const unsubR = subscribeToCollection('reservations', (data) => {
      setReservations(data);
      setLastSynced(new Date());
    });
    const unsubC = subscribeToCollection('users', (data) => {
      setCustomers(data.filter(u => !u.role || u.role === 'customer'));
      setLastSynced(new Date());
    });
    const unsubI = subscribeToCollection('inventory', (data) => {
      setInventory(data);
      setLastSynced(new Date());
    });
    return () => { unsubR(); unsubC(); unsubI(); };
  }, []);

  const totalReservations = reservations.length;
  const activeCustomers = customers.filter(c => c.status === 'Active').length;
  const pendingRequests = reservations.filter(r => r.status === 'Pending').length;
  const lowStockItems = inventory.filter(i => i.total === 0 || (i.available / i.total <= 0.2)).slice(0, 3);
  const recentCustomers = [...customers].sort((a,b) => (b.id || '').localeCompare(a.id || '')).slice(0, 3);

  const outfitCounts = {};
  reservations.forEach(r => { outfitCounts[r.outfit] = (outfitCounts[r.outfit] || 0) + 1; });
  const computedPopular = Object.entries(outfitCounts).sort((a,b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, value: count * 100 }));
  const finalPopular = computedPopular.length > 0 ? computedPopular : [{name: 'No data', value: 1}];

  // Build dynamic reservation trends from actual DB data
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCounts = {};
  daysOfWeek.forEach(d => dayCounts[d] = 0);
  
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  reservations.forEach(r => {
    if (r.date) {
      const resDate = new Date(r.date);
      // Filter based on dropdown
      if (trendFilter === 'This Week' && resDate < weekAgo) return;
      if (trendFilter === 'This Month' && resDate < monthAgo) return;

      const dayName = daysOfWeek[resDate.getDay()];
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
    }
  });
  const reservationTrends = daysOfWeek.map(d => ({ name: d, reservations: dayCounts[d] }));
  // Framer Motion Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
  };

  return (
    <div className="dashboard-page">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Dashboard Overview</h1>
          <p className="page-subtitle">Welcome back! Here is what is happening at JezSy Collection today.</p>
        </div>
        <div className="system-health flex-center gap-3">
          <div className="health-indicator flex-center gap-1 text-success text-sm font-medium px-3 py-1 rounded-full" style={{backgroundColor: 'rgba(34, 197, 94, 0.1)'}}>
            <CheckCircle2 size={16} /> Pipeline Healthy
          </div>
          <div className="sync-status flex-center gap-1 text-secondary text-xs">
            <RefreshCw size={12} /> Last synced: {lastSynced.toLocaleTimeString()}
          </div>
        </div>
      </div>

      <motion.div 
        className="stats-grid"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon calendar"><Calendar size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Total Reservations</p>
            <h3 className="stat-value">{totalReservations}</h3>
            <span className="stat-trend positive"><TrendingUp size={14}/> Live from DB</span>
          </div>
        </motion.div>
        
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon users"><Users size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Active Customers</p>
            <h3 className="stat-value">{activeCustomers}</h3>
            <span className="stat-trend positive"><TrendingUp size={14}/> Live from DB</span>
          </div>
        </motion.div>
        
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon clock"><Clock size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">Pending Requests</p>
            <h3 className="stat-value">{pendingRequests}</h3>
            <span className={pendingRequests > 0 ? "stat-trend negative" : "stat-trend positive"}>{pendingRequests > 0 ? "Requires attention" : "All caught up"}</span>
          </div>
        </motion.div>
        
        <motion.div variants={itemVariants} whileHover={{ y: -4 }} className="stat-card">
          <div className="stat-icon ar"><Shirt size={24} /></div>
          <div className="stat-info">
            <p className="stat-label">AR Try-On Usage</p>
            <h3 className="stat-value">—</h3>
            <span className="stat-trend positive">Not tracked yet</span>
          </div>
        </motion.div>
      </motion.div>

      <div className="charts-grid">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="chart-card card"
        >
          <div className="card-header">
            <h3>Reservation Trends</h3>
            <select className="input-field small-select" value={trendFilter} onChange={e => setTrendFilter(e.target.value)}>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
            </select>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={reservationTrends} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B6F5C" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8B6F5C" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B6B6B'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B6B6B'}} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <Tooltip />
                <Area type="monotone" dataKey="reservations" stroke="#8B6F5C" strokeWidth={3} fillOpacity={1} fill="url(#colorRes)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="chart-card card"
        >
          <div className="card-header">
            <h3>Popular Outfit Combinations</h3>
            <button className="text-btn">View All</button>
          </div>
          <div className="chart-container pie-container">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={finalPopular} cx="50%" cy="50%" innerRadius={70} outerRadius={100} fill="#8884d8" paddingAngle={5} dataKey="value">
                  {finalPopular.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pie-legend">
              {finalPopular.map((entry, index) => (
                <div key={index} className="legend-item">
                  <span className="legend-dot" style={{backgroundColor: COLORS[index % COLORS.length]}}></span>
                  <span className="legend-text">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="widgets-grid">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="widget card"
        >
          <div className="card-header">
            <h3>Low Stock Alerts</h3>
            <span className="badge-danger">{lowStockItems.length} Items</span>
          </div>
          <div className="widget-list">
            {lowStockItems.length === 0 && <div className="p-4 text-center text-secondary">All stock levels healthy.</div>}
            {lowStockItems.map(item => (
              <div key={item.id} className="widget-item alert-item">
                <div className="item-icon-bg alert"><AlertTriangle size={18} className="text-danger" /></div>
                <div className="item-details">
                  <h4>{item.item}</h4><p>Size {item.size} · Only {item.available} left</p>
                </div>
                <button className="btn-outline small">Restock</button>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="widget card"
        >
          <div className="card-header">
            <h3>Recent Customers</h3>
            <button className="text-btn">View All</button>
          </div>
          <div className="widget-list">
            {recentCustomers.length === 0 && <div className="p-4 text-center text-secondary">No customers yet.</div>}
            {recentCustomers.map((c, i) => (
              <div key={c.id} className="widget-item">
                <div className="avatar-small" style={{backgroundColor: `hsl(${200 + i*40}, 50%, 50%)`}}>
                  {(c.name || 'U')[0]}
                </div>
                <div className="item-details">
                  <h4>{c.name}</h4><p>{c.lastActive}</p>
                </div>
                <button className="icon-btn small"><Users size={16} /></button>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
export default Dashboard;
