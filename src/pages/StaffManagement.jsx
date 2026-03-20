import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserPlus, UserMinus, Shield, ShieldCheck, Mail, Clock, Search, Trash2, Crown } from 'lucide-react';
import { subscribeToCollection, addDocument, updateDocument, deleteDocument, logAction } from '../firebase/firestore';
import { toast } from 'sonner';
import './StaffManagement.css';

const StaffManagement = () => {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', role: 'Sales Staff', password: '' });
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsub = subscribeToCollection('staff', (data) => {
      setStaff(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    try {
      await addDocument('staff', {
        name: createForm.name,
        email: createForm.email,
        role: createForm.role,
        status: 'active',
        createdAt: new Date().toISOString()
      });
      await logAction(user, 'Created new staff account', { email: createForm.email, role: createForm.role });
      toast.success(`Staff account created for ${createForm.name}`);
      setIsCreateModalOpen(false);
      setCreateForm({ name: '', email: '', role: 'Sales Staff', password: '' });
    } catch (err) {
      toast.error('Failed to create staff account');
    }
  };

  const handleRemove = async (member) => {
    if (member.role === 'Owner') {
      toast.error('The master Owner account cannot be removed.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove ${member.name}?`)) return;
    try {
      await deleteDocument('staff', member.docId);
      await logAction(user, 'Removed staff member', { staffName: member.name });
      toast.success(`${member.name} removed from team`);
    } catch (err) {
      toast.error('Failed to remove staff member');
    }
  };

  const toggleRole = async (member) => {
    if (member.role === 'Owner') {
      toast.error('The Owner role cannot be downgraded. It is permanent.');
      return;
    }
    const newRole = member.role === 'Admin' ? 'Sales Staff' : 'Admin';
    try {
      await updateDocument('staff', member.docId, { role: newRole });
      await logAction(user, 'Changed staff role', { staffName: member.name, newRole });
      toast.success(`${member.name} is now ${newRole}`);
    } catch (err) {
      toast.error('Failed to update role');
    }
  };

  const filteredStaff = staff.filter(s => 
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const hasOwner = staff.some(s => s.role === 'Owner');
  const myData = staff.find(s => s.email === user.email);

  const claimOwnership = async () => {
    if (!myData) return toast.error("Could not find your staff profile.");
    try {
      await updateDocument('staff', myData.docId, { role: 'Owner' });
      await logAction(user, 'Claimed Master Ownership of the application');
      toast.success('You have successfully claimed the Owner role! 👑');
    } catch (err) {
      toast.error('Failed to claim ownership.');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Team Management</h1>
          <p className="page-subtitle">Create and manage staff accounts for the admin dashboard</p>
        </div>
        <button className="btn-primary flex-center gap-2" onClick={() => setIsCreateModalOpen(true)}>
          <UserPlus size={18} /> Create Staff Account
        </button>
      </div>

      {!hasOwner && user?.role === 'Admin' && (
        <div className="mb-6 p-4 rounded border-2 border-[var(--color-gold)] bg-[#faf5ed] flex justify-between items-center shadow-sm">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-gold)' }}>⚠️ Establish Master Ownership</h3>
            <p className="text-sm mt-1 text-secondary leading-relaxed">
              Your system currently does not have a designated <strong>Owner</strong>. The Owner is an immortal master account that cannot be downgraded or deleted by anyone else. If you are the founder, claim it now. This option can only be used once.
            </p>
          </div>
          <button className="btn-primary" style={{ backgroundColor: 'var(--color-gold)', whiteSpace: 'nowrap' }} onClick={claimOwnership}>
            Claim Ownership 👑
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-toolbar">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Added</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map(member => (
                <tr key={member.id}>
                  <td>
                    <div className="member-info">
                      <div className="avatar small-av" style={{backgroundColor: 'var(--color-gold)', color: 'white'}}>
                        {(member.name || 'U')[0]}
                      </div>
                      <div>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-secondary text-xs">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div 
                      className={`role-chip ${member.role === 'Owner' ? 'owner-chip' : ''}`} 
                      onClick={() => toggleRole(member)} 
                      style={{cursor: member.role === 'Owner' ? 'default' : 'pointer'}}
                      title={member.role === 'Owner' ? "Role locked" : "Click to toggle role"}
                    >
                      {member.role === 'Owner' && <Crown size={14} style={{color: 'var(--color-gold)'}} />}
                      {member.role === 'Admin' && <ShieldCheck size={14} className="text-success" />}
                      {member.role === 'Sales Staff' && <Shield size={14} className="text-secondary" />}
                      <span style={{ fontWeight: member.role === 'Owner' ? 700 : 500 }}>{member.role}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`status-dot ${member.status}`}></span>
                    <span className="text-capitalize">{member.status}</span>
                  </td>
                  <td className="text-secondary text-sm">
                    {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="text-right">
                    {member.role !== 'Owner' && (
                      <button className="icon-btn-small text-danger" onClick={() => handleRemove(member)} title="Remove Staff Member">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {loading && <tr><td colSpan="5" className="text-center py-8">Loading team...</td></tr>}
              {!loading && filteredStaff.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-secondary">No staff members found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: 400}}>
            <div className="modal-header">
              <h2>Create Staff Account</h2>
              <button className="close-btn" onClick={() => setIsCreateModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleCreateAccount} className="modal-body">
              <div className="form-group">
                <label className="label">Full Name</label>
                <input type="text" className="input-field" value={createForm.name} onChange={e => setCreateForm({...createForm, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="label">Email Address</label>
                <input type="email" className="input-field" value={createForm.email} onChange={e => setCreateForm({...createForm, email: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="label">Access Role</label>
                <select className="input-field" value={createForm.role} onChange={e => setCreateForm({...createForm, role: e.target.value})}>
                  <option value="Sales Staff">Sales Staff</option>
                  <option value="Admin">Admin (Full Access)</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffManagement;
