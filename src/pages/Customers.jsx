import React, { useState } from 'react';
import { Search, Filter, MoreVertical, Mail, Phone, ExternalLink, UserMinus } from 'lucide-react';
import { subscribeToCollection } from '../firebase/firestore';
import StatusBadge from '../components/StatusBadge';
import { getAvatarColor, getUserDisplayName } from '../utils/helpers';
import './Customers.css';

const Customers = () => {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  React.useEffect(() => {
    const unsub = subscribeToCollection('users', (data) => {
      // Logic: Only show 'customer' role in this view.
      // If no role exists, we assume it's an app customer.
      setUsers(data.filter(user => !user.role || user.role === 'customer'));
    });
    return () => unsub();
  }, []);

  const filteredUsers = users.filter(user => {
    const name = getUserDisplayName(user).toLowerCase();
    const email = (user.email || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  return (
    <div className="customers-page">
      <div className="page-header">
        <h1 className="page-title">Customer Engagement</h1>
        <p className="page-subtitle">Manage registered app users, track their loyalty status and demographics</p>
      </div>

      <div className="card">
        <div className="table-controls">
          <div className="search-box search-field">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              className="input-field pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-outline flex items-center gap-2"><Filter size={18} /> Filters</button>
            <button className="btn-outline flex items-center gap-2">Export CSV</button>
          </div>
        </div>

        <div className="customer-table-container">
          <table className="customer-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Status</th>
                <th>Location</th>
                <th>Registered</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-secondary">No customers found.</td>
                </tr>
              )}
              {filteredUsers.map(user => {
                const displayName = getUserDisplayName(user);
                return (
                  <tr key={user.id} className="customer-row">
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar" style={{ backgroundColor: getAvatarColor(displayName) }}>
                          {displayName.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="user-info">
                          <h5>{displayName}</h5>
                          <p>{user.email || 'No email'}</p>
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge status={user.status || 'Active'} /></td>
                    <td>{user.location || 'Not set'}</td>
                    <td>{user.registeredAt?.toDate().toLocaleDateString() || 'N/A'}</td>
                    <td className="actions-cell">
                      <button className="btn-outline btn-icon" title="Email"><Mail size={16}/></button>
                      <button className="btn-outline btn-icon" title="View Profile"><ExternalLink size={16}/></button>
                      <button className="btn-outline btn-icon text-danger" title="Block User"><UserMinus size={16}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="nav-pagination">
          <div className="pagination-info">Showing 1 to {filteredUsers.length} of {filteredUsers.length} customers</div>
          <div className="pagination-btns">
            <button className="page-btn" disabled>&lt;</button>
            <button className="page-btn active">1</button>
            <button className="page-btn" disabled>&gt;</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Customers;
