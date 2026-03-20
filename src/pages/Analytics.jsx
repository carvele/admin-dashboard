import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { TrendingUp, Users, ShoppingBag, CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import './Analytics.css';

const DATA_REVENUE = [
  { name: 'Jan', revenue: 4000, users: 2400 },
  { name: 'Feb', revenue: 3000, users: 1398 },
  { name: 'Mar', revenue: 2000, users: 9800 },
  { name: 'Apr', revenue: 2780, users: 3908 },
  { name: 'May', revenue: 1890, users: 4800 },
  { name: 'Jun', revenue: 2390, users: 3800 },
  { name: 'Jul', revenue: 3490, users: 4300 },
];

const DATA_CATEGORIES = [
  { name: 'Shirts', value: 400 },
  { name: 'Pants', value: 300 },
  { name: 'Dresses', value: 200 },
  { name: 'Outerwear', value: 150 },
];

const COLORS = ['#8B6F5C', '#C9BEB4', '#E8DDD3', '#2C2C2C'];

const Analytics = () => {
  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1 className="page-title">Advanced Analytics</h1>
        <p className="page-subtitle">Detailed insights into your store's performance and customer behavior</p>
      </div>

      <div className="stats-summary">
        <div className="summary-card">
          <h4>Total Revenue</h4>
          <span className="summary-value">$45,231.89</span>
          <div className="summary-trend positive">
            <ArrowUpRight size={16} /> <span>+20.1% vs last month</span>
          </div>
        </div>
        <div className="summary-card">
          <h4>Active Users</h4>
          <span className="summary-value">2,350</span>
          <div className="summary-trend positive">
            <ArrowUpRight size={16} /> <span>+12.5% vs last month</span>
          </div>
        </div>
        <div className="summary-card">
          <h4>Conversion Rate</h4>
          <span className="summary-value">3.24%</span>
          <div className="summary-trend negative">
            <ArrowDownRight size={16} /> <span>-0.4% vs last month</span>
          </div>
        </div>
        <div className="summary-card">
          <h4>AR Try-ins</h4>
          <span className="summary-value">12,402</span>
          <div className="summary-trend positive">
            <ArrowUpRight size={16} /> <span>+45.2% vs last month</span>
          </div>
        </div>
      </div>

      <div className="main-charts">
        <div className="card revenue-chart">
          <div className="card-header">
            <h3>Revenue & Growth</h3>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <AreaChart data={DATA_REVENUE}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B6F5C" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8B6F5C" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#8B6F5C" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card top-products">
          <div className="card-header">
            <h3>Top Categories</h3>
          </div>
          <div style={{ width: '100%', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={DATA_CATEGORIES}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {DATA_CATEGORIES.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="secondary-charts">
        <div className="card age-dist">
          <div className="card-header">
            <h3>Customer Activity</h3>
          </div>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={DATA_REVENUE}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="users" fill="#C9BEB4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card conversion-funnel">
          <div className="card-header">
            <h3>Best Sellers</h3>
          </div>
          <div className="product-rank-list">
            {[
              { rank: 1, name: 'Linen Summer Shirt', sales: '1,204', revenue: '$34,921' },
              { rank: 2, name: 'Classic Chinos', sales: '942', revenue: '$22,510' },
              { rank: 3, name: 'Silk Cocktail Dress', sales: '753', revenue: '$67,800' },
              { rank: 4, name: 'Denim Jacket', sales: '612', revenue: '$15,300' },
            ].map(item => (
              <div key={item.rank} className="product-rank-item">
                <div className="rank-number">{item.rank}</div>
                <div className="product-rank-info">
                  <h5>{item.name}</h5>
                  <p>{item.sales} sales this week</p>
                </div>
                <div className="rank-value">{item.revenue}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
