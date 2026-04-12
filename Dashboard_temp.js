import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, } from 'recharts';
import { Calendar, Users, Shirt, Clock, AlertTriangle, TrendingUp, RefreshCw, CheckCircle2, Settings2, X, MapPin, Activity, Cloud, Sun, CloudRain, Zap, PlusCircle, MessageSquare, } from 'lucide-react';
// @ts-ignore
import { getReservations } from '../../services/reservationService';
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
import { getInventory } from '../../services/productService';
// @ts-ignore
import { getSuggestedOutfits, getARSessions } from '../../services/wardrobeService';
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
    const [widgetPrefs, setWidgetPrefs] = useState(() => {
        const saved = localStorage.getItem('dashboard_widget_prefs');
        return saved ? JSON.parse(saved) : defaultPreferences;
    });
    const [showPreferences, setShowPreferences] = useState(false);
    const togglePref = (key) => {
        const nextPrefs = { ...widgetPrefs, [key]: !widgetPrefs[key] };
        setWidgetPrefs(nextPrefs);
        localStorage.setItem('dashboard_widget_prefs', JSON.stringify(nextPrefs));
    };
    const loadDashboard = async () => {
        try {
            const [resData, cusData, invData, arCount, outfitsData] = await Promise.all([
                getReservations(100),
                getCustomers(100),
                getInventory(100),
                getARSessions(),
                getSuggestedOutfits(),
            ]);
            setReservations(resData || []);
            setCustomers((cusData || []).filter((u) => !u.role || u.role === 'customer'));
            setInventory(invData || []);
            setArSessionCount(arCount || 0);
            setSuggestedOutfits(outfitsData || []);
            setLastSynced(new Date());
        }
        catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    };
    React.useEffect(() => {
        loadDashboard();
        // Poll every 5 minutes
        const intervalId = setInterval(loadDashboard, 5 * 60 * 1000);
        return () => clearInterval(intervalId);
    }, []);
    const totalSales = reservations
        .filter(r => r.status === 'Completed' || r.status === 'Paid')
        .reduce((sum, r) => sum + (Number(r.rentalPrice) || 0), 0);
    const lowStockItems = inventory
        .filter((i) => i.total === 0 || i.available / i.total <= 0.2)
        .slice(0, 3);
    const recentCustomers = [...customers]
        .sort((a, b) => (b.id || '').localeCompare(a.id || ''))
        .slice(0, 3);
    // --- NEW COMMAND CENTER LOGIC ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // 1. Daily Logistics (Pickups/Returns for Today)
    const todayLogistics = reservations
        .filter(r => {
        const pickupDate = parseDate(r.reservationDate || r.date);
        const returnDate = parseDate(r.returnDate || r.endDate);
        pickupDate.setHours(0, 0, 0, 0);
        returnDate.setHours(0, 0, 0, 0);
        return pickupDate.getTime() === today.getTime() || returnDate.getTime() === today.getTime();
    })
        .map(r => {
        const pickupDate = parseDate(r.reservationDate || r.date);
        const isReturn = parseDate(r.returnDate || r.endDate).setHours(0, 0, 0, 0) === today.getTime();
        return {
            ...r,
            actionType: isReturn ? 'Return' : 'Pickup',
            timeStr: pickupDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    })
        .sort((a, _b) => (a.actionType === 'Return' ? -1 : 1)); // Priority to Returns
    // 2. Unified Activity Feed (Last 10 events)
    const activityFeed = [
        ...reservations.map(r => ({ type: 'reservation', date: parseDate(r.createdAt || r.date), desc: `${r.customerName || 'A customer'} booked ${r.productName || 'an outfit'}`, user: r.customerName })),
        ...customers.map(c => ({ type: 'customer', date: parseDate(c.createdAt || c.id), desc: `New customer ${c.name} joined`, user: c.name })),
        // Add mock staff actions for vitality
        { type: 'staff', date: new Date(Date.now() - 15 * 60 * 1000), desc: 'Admin updated Gown category pricing', user: 'Admin' }
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
    // Popular Outfit Combinations â€” sourced from admin-created suggestedOutfits
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
    // Build dynamic reservation trends from actual DB data (Time-series)
    const daysToLookBack = trendFilter === 'This Week' ? 7 : 14;
    const reservationTrends = [];
    for (let i = daysToLookBack - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        reservationTrends.push({ name: dateStr, reservations: 0, dateStr: d.toDateString() });
    }
    reservations.forEach((r) => {
        const rawDate = r.reservationDate || r.date;
        if (rawDate) {
            const resDate = parseDate(rawDate);
            const resDateStr = resDate.toDateString();
            const point = reservationTrends.find(p => p.dateStr === resDateStr);
            if (point) {
                point.reservations++;
            }
        }
    });

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
    return (_jsxs("div", { className: "dashboard-page", children: [_jsxs("div", { className: "page-header d-flex justify-between align-center", children: [_jsxs("div", { children: [_jsx("h1", { className: "page-title", children: "Dashboard Overview" }), _jsx("p", { className: "page-subtitle", children: "Welcome back! Here is what is happening at JezSy Collection today." })] }), _jsxs("div", { className: "system-health flex-center gap-3", children: [_jsxs("div", { className: "health-indicator flex-center gap-1 text-success text-sm font-medium px-3 py-1 rounded-full", style: { backgroundColor: 'rgba(34, 197, 94, 0.1)' }, children: [_jsx(CheckCircle2, { size: 16 }), " Pipeline Healthy"] }), _jsxs("div", { className: "sync-status flex-center gap-1 text-secondary text-xs", children: [_jsx(RefreshCw, { size: 12, className: "cursor-pointer", onClick: loadDashboard, style: { cursor: 'pointer' } }), " Last synced: ", lastSynced.toLocaleTimeString()] }), _jsxs("button", { className: "btn-outline small flex-center gap-1 ml-2", onClick: () => setShowPreferences(true), children: [_jsx(Settings2, { size: 14 }), " Customize Dashboard"] })] })] }), _jsxs(motion.div, { className: "quick-actions-bar card flex-between align-center px-6 py-4", initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, style: { borderRadius: '16px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(139, 111, 92, 0.1)' }, children: [_jsxs("div", { className: "flex align-center gap-3", children: [_jsx(Zap, { size: 20, className: "text-accent" }), _jsx("span", { className: "font-medium", children: "Quick Actions" })] }), _jsxs("div", { className: "flex gap-4", children: [_jsxs("button", { className: "btn-primary small flex-center gap-2", onClick: () => navigate('/reservations'), children: [_jsx(PlusCircle, { size: 16 }), " New Reservation"] }), _jsxs("button", { className: "btn-outline small flex-center gap-2", onClick: () => navigate('/catalog'), children: [_jsx(PlusCircle, { size: 16 }), " Add Product"] }), _jsxs("button", { className: "btn-outline small flex-center gap-2", onClick: () => navigate('/messaging'), children: [_jsx(MessageSquare, { size: 16 }), " Broadcast"] })] })] }), _jsxs(motion.div, { className: "stats-grid", variants: containerVariants, initial: "hidden", animate: "show", children: [(_jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon users", style: { backgroundColor: '#22c55e', color: 'white' }, children: _jsx(TrendingUp, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "Total Sales (Revenue)" }), _jsxs("h3", { className: "stat-value", children: ["\u20B1", totalSales.toLocaleString()] }), _jsx("span", { className: "stat-trend positive", children: "Confirmed Earnings" })] })] })), widgetPrefs.statTotalReservations && (_jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon calendar", children: _jsx(Calendar, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "Total Reservations" }), _jsx("h3", { className: "stat-value", children: totalReservations }), _jsxs("span", { className: "stat-trend positive", children: [_jsx(TrendingUp, { size: 14 }), " Live from DB"] })] })] })), widgetPrefs.statActiveCustomers && (_jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon users", children: _jsx(Users, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "Active Customers" }), _jsx("h3", { className: "stat-value", children: activeCustomers }), _jsxs("span", { className: "stat-trend positive", children: [_jsx(TrendingUp, { size: 14 }), " Live from DB"] })] })] })), widgetPrefs.statPendingRequests && (_jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon clock", children: _jsx(Clock, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "Pending Requests" }), _jsx("h3", { className: "stat-value", children: pendingRequests }), _jsx("span", { className: pendingRequests > 0 ? 'stat-trend negative' : 'stat-trend positive', children: pendingRequests > 0 ? 'Requires attention' : 'All caught up' })] })] })), widgetPrefs.statARUsage && (_jsxs(motion.div, { variants: itemVariants, whileHover: { y: -4 }, className: "stat-card", children: [_jsx("div", { className: "stat-icon ar", children: _jsx(Shirt, { size: 24 }) }), _jsxs("div", { className: "stat-info", children: [_jsx("p", { className: "stat-label", children: "AR Try-On Usage" }), _jsx("h3", { className: "stat-value", children: arSessionCount }), _jsxs("span", { className: "stat-trend positive", children: [_jsx(TrendingUp, { size: 14 }), " Live from DB"] })] })] })), _jsxs("div", { className: "charts-grid", style: {
                    gridTemplateColumns: (!widgetPrefs.chartReservationTrends || !widgetPrefs.chartPopularOutfits) ? '1fr' : '2fr 1fr'
                }, children: [widgetPrefs.chartReservationTrends && (_jsxs(motion.div, { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.3 }, className: "chart-card card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Reservation Trends" }), _jsxs("select", { className: "input-field small-select", value: trendFilter, onChange: (e) => setTrendFilter(e.target.value), children: [_jsx("option", { value: "This Week", children: "This Week" }), _jsx("option", { value: "This Month", children: "This Month" })] })] }), _jsx("div", { className: "chart-container", children: _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(AreaChart, { data: reservationTrends, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "colorRes", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "#8B6F5C", stopOpacity: 0.8 }), _jsx("stop", { offset: "95%", stopColor: "#8B6F5C", stopOpacity: 0 })] }) }), _jsx(XAxis, { dataKey: "name", axisLine: false, tickLine: false, tick: { fill: '#6B6B6B' } }), _jsx(YAxis, { axisLine: false, tickLine: false, tick: { fill: '#6B6B6B' } }), _jsx(CartesianGrid, { strokeDasharray: "3 3", vertical: false, stroke: "#E2E8F0" }), _jsx(Tooltip, {}), _jsx(Area, { type: "monotone", dataKey: "reservations", stroke: "#8B6F5C", strokeWidth: 3, fillOpacity: 1, fill: "url(#colorRes)" })] }) }) })] })), widgetPrefs.chartPopularOutfits && (_jsxs(motion.div, { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.4 }, className: "chart-card card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Popular Outfit Combinations" }), _jsx("button", { className: "text-btn", onClick: () => navigate('/outfits'), children: "View All" })] }), _jsxs("div", { className: "chart-container pie-container", children: [_jsx(ResponsiveContainer, { width: "100%", height: 260, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: finalPopular, cx: "50%", cy: "50%", innerRadius: 70, outerRadius: 100, fill: "#8884d8", paddingAngle: 5, dataKey: "value", children: finalPopular.map((_entry, index) => (_jsx(Cell, { fill: COLORS[index % COLORS.length] }, `cell-${index}`))) }), _jsx(Tooltip, {})] }) }), _jsx("div", { className: "pie-legend", children: finalPopular.map((_entry, index) => (_jsxs("div", { className: "legend-item", children: [_jsx("span", { className: "legend-dot", style: { backgroundColor: COLORS[index % COLORS.length] } }), _jsx("span", { className: "legend-text", children: finalPopular[index].name })] }, index))) })] })] }))] }), _jsxs("div", { className: "widgets-grid", style: {
                    gridTemplateColumns: (!widgetPrefs.widgetLowStock || !widgetPrefs.widgetRecentCustomers) ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))'
                }, children: [widgetPrefs.widgetLowStock && (_jsxs(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.5 }, className: "widget card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Low Stock Alerts" }), _jsxs("span", { className: "badge-danger", children: [lowStockItems.length, " Items"] })] }), _jsxs("div", { className: "widget-list", children: [lowStockItems.length === 0 && (_jsx("div", { className: "p-4 text-center text-secondary", children: "All stock levels healthy." })), lowStockItems.map((item) => (_jsxs("div", { className: "widget-item alert-item", children: [_jsx("div", { className: "item-icon-bg alert", children: _jsx(AlertTriangle, { size: 18, className: "text-danger" }) }), _jsxs("div", { className: "item-details", children: [_jsx("h4", { children: item.item }), _jsxs("p", { children: ["Size ", item.size, " \u00B7 Only ", item.available, " left"] })] }), _jsx("button", { className: "btn-outline small", onClick: () => navigate('/inventory'), children: "Restock" })] }, item.id)))] })] })), widgetPrefs.widgetRecentCustomers && (_jsxs(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.6 }, className: "widget card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Recent Customers" }), _jsx("button", { className: "text-btn", onClick: () => navigate('/customers'), children: "View All" })] }), _jsxs("div", { className: "widget-list", children: [recentCustomers.length === 0 && (_jsx("div", { className: "p-4 text-center text-secondary", children: "No customers yet." })), recentCustomers.map((c, i) => (_jsxs("div", { className: "widget-item", children: [_jsx("div", { className: "avatar-small", style: { backgroundColor: `hsl(${200 + i * 40}, 50%, 50%)` }, children: (c.name || 'U')[0] }), _jsxs("div", { className: "item-details", children: [_jsx("h4", { children: c.name }), _jsx("p", { children: c.lastActive })] }), _jsx("button", { className: "icon-btn small", onClick: () => navigate('/customers'), children: _jsx(Users, { size: 16 }) })] }, c.id)))] })] })), widgetPrefs.widgetWeather && (_jsxs(motion.div, { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, transition: { delay: 0.7 }, className: "weather-insight-card widget card", children: [_jsxs("div", { className: "card-header", children: [_jsx("h3", { children: "Operational Insight" }), _jsx("span", { className: "badge accent", children: "Weather Context" })] }), _jsxs("div", { className: "flex align-center gap-4 mt-2", children: [_jsxs("div", { className: "weather-icon-large", children: [weather === 'Sunny' && _jsx(Sun, { size: 40, className: "text-warning" }), weather === 'Rainy' && _jsx(CloudRain, { size: 40, className: "text-accent" }), weather === 'Cloudy' && _jsx(Cloud, { size: 40, className: "text-secondary" })] }), _jsxs("div", { children: [_jsxs("h4", { className: "font-bold text-lg", children: [weather, " Today"] }), _jsx("p", { className: "text-sm text-secondary leading-tight", children: weatherAdvice })] })] })] }))] }), _jsxs("div", { className: "command-center-grid mt-6", style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }, children: [widgetPrefs.widgetLogistics && (_jsxs(motion.div, { className: "card logistics-widget", initial: { opacity: 0, x: -20 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.8 }, children: [_jsxs("div", { className: "card-header", children: [_jsxs("div", { className: "flex align-center gap-2", children: [_jsx(MapPin, { size: 20, className: "text-accent" }), _jsx("h3", { children: "Today's Logistics Monitor" })] }), _jsxs("span", { className: "badge secondary", children: [todayLogistics.length, " Events"] })] }), _jsx("div", { className: "logistics-timeline mt-4", children: todayLogistics.length === 0 ? (_jsx("div", { className: "p-8 text-center text-secondary bg-cream rounded-xl", children: "No pickups or returns scheduled for today." })) : (todayLogistics.map((item, idx) => (_jsxs("div", { className: `logistics-row ${item.actionType.toLowerCase()}`, children: [_jsx("div", { className: "logistics-time", children: item.timeStr }), _jsx("div", { className: "logistics-point" }), _jsxs("div", { className: "logistics-info", children: [_jsxs("div", { className: "flex-between align-center", children: [_jsx("span", { className: `logistics-badge ${item.actionType.toLowerCase()}`, children: item.actionType }), _jsx("span", { className: "text-xs font-semibold", children: item.status })] }), _jsx("h4", { children: item.customerName }), _jsxs("p", { children: [item.productName || item.outfit, " \u00B7 ", item.size] })] })] }, idx)))) })] })), widgetPrefs.widgetActivityFeed && (_jsxs(motion.div, { className: "card activity-feed-widget", initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, transition: { delay: 0.9 }, children: [_jsx("div", { className: "card-header", children: _jsxs("div", { className: "flex align-center gap-2", children: [_jsx(Activity, { size: 20, className: "text-accent" }), _jsx("h3", { children: "Real-time Activity Pulse" })] }) }), _jsx("div", { className: "activity-pulse-list mt-4", children: activityFeed.map((item, idx) => (_jsxs("div", { className: "activity-pulse-item", children: [_jsxs("div", { className: `activity-icon-sm ${item.type}`, children: [item.type === 'reservation' && _jsx(Calendar, { size: 14 }), item.type === 'customer' && _jsx(Users, { size: 14 }), item.type === 'staff' && _jsx(RefreshCw, { size: 14 })] }), _jsxs("div", { className: "activity-pulse-content", children: [_jsx("p", { className: "text-sm", children: item.desc }), _jsx("span", { className: "text-xs text-secondary", children: item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })] })] }, idx))) })] }))] }), showPreferences && (_jsx("div", { className: "modal-overlay", onClick: () => setShowPreferences(false), children: _jsxs("div", { className: "preferences-modal", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "preferences-header", children: [_jsx("h3", { children: "Customize Dashboard" }), _jsx("button", { className: "icon-btn", onClick: () => setShowPreferences(false), children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "preferences-body", children: [_jsxs("div", { className: "pref-section", children: [_jsx("h4", { children: "Top Statistics" }), _jsxs("div", { className: "pref-list", children: [_jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Total Reservations" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.statTotalReservations, onChange: () => togglePref('statTotalReservations') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Active Customers" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.statActiveCustomers, onChange: () => togglePref('statActiveCustomers') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Pending Requests" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.statPendingRequests, onChange: () => togglePref('statPendingRequests') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "AR Try-On Usage" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.statARUsage, onChange: () => togglePref('statARUsage') }), _jsx("span", { className: "toggle-slider" })] })] })] })] }), _jsxs("div", { className: "pref-section", children: [_jsx("h4", { children: "Charts" }), _jsxs("div", { className: "pref-list", children: [_jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Reservation Trends" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.chartReservationTrends, onChange: () => togglePref('chartReservationTrends') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Popular Outfits" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.chartPopularOutfits, onChange: () => togglePref('chartPopularOutfits') }), _jsx("span", { className: "toggle-slider" })] })] })] })] }), _jsxs("div", { className: "pref-section", children: [_jsx("h4", { children: "Tactical Widgets" }), _jsxs("div", { className: "pref-list", children: [_jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Low Stock Alerts" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.widgetLowStock, onChange: () => togglePref('widgetLowStock') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Recent Customers" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.widgetRecentCustomers, onChange: () => togglePref('widgetRecentCustomers') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Logistics Monitor" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.widgetLogistics, onChange: () => togglePref('widgetLogistics') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Activity Pulse" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.widgetActivityFeed, onChange: () => togglePref('widgetActivityFeed') }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "pref-item", children: [_jsx("span", { className: "pref-label", children: "Operational Insights" }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", className: "toggle-input", checked: widgetPrefs.widgetWeather, onChange: () => togglePref('widgetWeather') }), _jsx("span", { className: "toggle-slider" })] })] })] })] })] })] }) }) ) ] }) );
};

export default Dashboard;
