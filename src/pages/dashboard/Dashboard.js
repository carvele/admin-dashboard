import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, } from 'recharts';
import { Calendar, Users, Shirt, Clock, AlertTriangle, TrendingUp, RefreshCw, CheckCircle2, } from 'lucide-react';
// @ts-ignore
import { subscribeToReservations } from '../../services/reservationService';
// @ts-ignore
import { subscribeToCustomers } from '../../services/customerService';
// @ts-ignore
import { subscribeToInventory } from '../../services/productService';
// @ts-ignore
import { subscribeToSuggestedOutfits, subscribeToARSessions } from '../../services/wardrobeService';
import { motion } from 'framer-motion';
import './Dashboard.css';
const COLORS = ['#8B6F5C', '#C9BEB4', '#E8DDD3', '#2C2C2C'];
const parseDate = (d) => {
    if (!d)
        return new Date();
    if (d.toDate)
        return d.toDate();
    if (d.seconds)
        return new Date(d.seconds * 1000);
    return new Date(d);
};
const Dashboard = () => {
    const navigate = useNavigate();
    const [reservations, setReservations] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [suggestedOutfits, setSuggestedOutfits] = useState([]);
    const [arSessionCount, setArSessionCount] = useState(0);
    const [trendFilter, setTrendFilter] = useState('This Week');
    const [lastSynced, setLastSynced] = useState(new Date());
    React.useEffect(() => {
        const unsubR = subscribeToReservations((data) => {
            setReservations(data);
            setLastSynced(new Date());
        });
        const unsubC = subscribeToCustomers((data) => {
            setCustomers(data.filter((u) => !u.role || u.role === 'customer'));
            setLastSynced(new Date());
        });
        const unsubI = subscribeToInventory((data) => {
            setInventory(data);
            setLastSynced(new Date());
        });
        const unsubO = subscribeToSuggestedOutfits((data) => {
            setSuggestedOutfits(data);
            setLastSynced(new Date());
        });
        const unsubAR = subscribeToARSessions((data) => {
            setArSessionCount(data.length);
            setLastSynced(new Date());
        });
        return () => {
            unsubR();
            unsubC();
            unsubI();
            unsubO();
            unsubAR();
        };
    }, []);
    const totalReservations = reservations.length;
    const activeCustomers = customers.filter((c) => c.status === 'Active').length;
    const pendingRequests = reservations.filter((r) => r.status === 'Pending').length;
    const lowStockItems = inventory
        .filter((i) => i.total === 0 || i.available / i.total <= 0.2)
        .slice(0, 3);
    const recentCustomers = [...customers]
        .sort((a, b) => (b.id || '').localeCompare(a.id || ''))
        .slice(0, 3);
    // Popular Outfit Combinations — sourced from admin-created suggestedOutfits
    const outfitCounts = {};
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
    const finalPopular = computedPopular.length > 0 ? computedPopular : [{ name: 'No suggestions yet', value: 1 }];
    // Build dynamic reservation trends from actual DB data
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = {};
    daysOfWeek.forEach((d) => (dayCounts[d] = 0));
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    reservations.forEach((r) => {
        const rawDate = r.reservationDate || r.date;
        if (rawDate) {
            const resDate = parseDate(rawDate);
            // Filter based on dropdown
            if (trendFilter === 'This Week' && resDate < weekAgo)
                return;
            if (trendFilter === 'This Month' && resDate < monthAgo)
                return;
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
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
    };
    return (_jsxs("div", { className: "dashboard-page", children: [_jsxs("div", { className: "page-header d-flex justify-between align-center", children: [_jsxs("div", { children: [_jsx("h1", { className: "page-title", children: "Dashboard Overview" }), _jsx("p", { className: "page-subtitle", children: "Welcome back! Here is what is happening at JezSy Collection today." })] }), _jsxs("div", { className: "system-health flex-center gap-3", children: [_jsxs("div", { className: "health-indicator flex-center gap-1 text-success text-sm font-medium px-3 py-1 rounded-full", style: { backgroundColor: 'rgba(34, 197, 94, 0.1)' }, children: [_jsx(CheckCircle2, { size: 16 }), " Pipeline Healthy"] }), _jsxs("div", { className: "sync-status flex-center gap-1 text-secondary text-xs", children: [_jsx(RefreshCw, { size: 12 }), " Last synced: ", lastSynced.toLocaleTimeString()] })] })] }), _jsxs(motion.div, { className: "stats-grid", variants: containerVariants, initial: "hidden", animate: "show", children: [_jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon calendar", children: _jsx(Calendar, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "Total Reservations" }), _jsx("h3", { className: "stat-value", children: totalReservations }), _jsxs("span", { className: "stat-trend positive", children: [_jsx(TrendingUp, { size: 14 }), " Live from DB"] })] })] }), _jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon users", children: _jsx(Users, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "Active Customers" }), _jsx("h3", { className: "stat-value", children: activeCustomers }), _jsxs("span", { className: "stat-trend positive", children: [_jsx(TrendingUp, { size: 14 }), " Live from DB"] })] })] }), _jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon clock", children: _jsx(Clock, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "Pending Requests" }), _jsx("h3", { className: "stat-value", children: pendingRequests }), _jsx("span", { className: pendingRequests > 0 ? 'stat-trend negative' : 'stat-trend positive', children: pendingRequests > 0 ? 'Requires attention' : 'All caught up' })] })] }), _jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon ar", children: _jsx(Shirt, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "AR Try-On Usage" }), _jsx("h3", { className: "stat-value", children: arSessionCount }), _jsxs("span", { className: "stat-trend positive", children: [_jsx(TrendingUp, { size: 14 }), " Live from DB"] })] })] })] }), _jsxs("div", { className: "charts-grid", children: [_jsxs(motion.div, { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.3 }, className: "chart-card card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Reservation Trends" }), _jsxs("select", { className: "input-field small-select", value: trendFilter, onChange: (e) => setTrendFilter(e.target.value), children: [_jsx("option", { value: "This Week", children: "This Week" }), _jsx("option", { value: "This Month", children: "This Month" })] })] }), _jsx("div", { className: "chart-container", children: _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(AreaChart, { data: reservationTrends, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "colorRes", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#8B6F5C", stopOpacity: 0.8 }), _jsx("stop", { offset: "95%", stopColor: "#8B6F5C", stopOpacity: 0 })] }) }), _jsx(XAxis, { dataKey: "name", axisLine: false, tickLine: false, tick: { fill: '#6B6B6B' } }), _jsx(YAxis, { axisLine: false, tickLine: false, tick: { fill: '#6B6B6B' } }), _jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "#E2E8F0" }), _jsx(Tooltip, {}), _jsx(Area, { type: "monotone", dataKey: "reservations", stroke: "#8B6F5C", strokeWidth: 3, fillOpacity: 1, fill: "url(#colorRes)" })] }) }) })] }), _jsxs(motion.div, { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.4 }, className: "chart-card card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Popular Outfit Combinations" }), _jsx("button", { className: "text-btn", onClick: () => navigate('/outfits'), children: "View All" })] }), _jsxs("div", { className: "chart-container pie-container", children: [_jsx(ResponsiveContainer, { width: "100%", height: 260, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: finalPopular, cx: "50%", cy: "50%", innerRadius: 70, outerRadius: 100, fill: "#8884d8", paddingAngle: 5, dataKey: "value", children: finalPopular.map((_entry, index) => (_jsx(Cell, { fill: COLORS[index % COLORS.length] }, `cell-${index}`))) }), _jsx(Tooltip, {})] }) }), _jsx("div", { className: "pie-legend", children: finalPopular.map((_entry, index) => (_jsxs("div", { className: "legend-item", children: [_jsx("span", { className: "legend-dot", style: { backgroundColor: COLORS[index % COLORS.length] } }), _jsx("span", { className: "legend-text", children: finalPopular[index].name })] }, index))) })] })] })] }), _jsxs("div", { className: "widgets-grid", children: [_jsxs(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.5 }, className: "widget card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Low Stock Alerts" }), _jsxs("span", { className: "badge-danger", children: [lowStockItems.length, " Items"] })] }), _jsxs("div", { className: "widget-list", children: [lowStockItems.length === 0 && (_jsx("div", { className: "p-4 text-center text-secondary", children: "All stock levels healthy." })), lowStockItems.map((item) => (_jsxs("div", { className: "widget-item alert-item", children: [_jsx("div", { className: "item-icon-bg alert", children: _jsx(AlertTriangle, { size: 18, className: "text-danger" }) }), _jsxs("div", { className: "item-details", children: [_jsx("h4", { children: item.item }), _jsxs("p", { children: ["Size ", item.size, " \u00B7 Only ", item.available, " left"] })] }), _jsx("button", { className: "btn-outline small", onClick: () => navigate('/inventory'), children: "Restock" })] }, item.id)))] })] }), _jsxs(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.6 }, className: "widget card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Recent Customers" }), _jsx("button", { className: "text-btn", onClick: () => navigate('/customers'), children: "View All" })] }), _jsxs("div", { className: "widget-list", children: [recentCustomers.length === 0 && (_jsx("div", { className: "p-4 text-center text-secondary", children: "No customers yet." })), recentCustomers.map((c, i) => (_jsxs("div", { className: "widget-item", children: [_jsx("div", { className: "avatar-small", style: { backgroundColor: `hsl(${200 + i * 40}, 50%, 50%)` }, children: (c.name || 'U')[0] }), _jsxs("div", { className: "item-details", children: [_jsx("h4", { children: c.name }), _jsx("p", { children: c.lastActive })] }), _jsx("button", { className: "icon-btn small", onClick: () => navigate('/customers'), children: _jsx(Users, { size: 16 }) })] }, c.id)))] })] })] })] }));
};
export default Dashboard;
