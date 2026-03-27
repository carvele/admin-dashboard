import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserPlus, UserMinus, Shield, ShieldCheck, Mail, Clock, Search, Trash2, Crown } from 'lucide-react';
import { subscribeToCollection, addDocument, updateDocument, deleteDocument, logAction } from '../../firebase/firestore';
import { initializeApp } from 'firebase/app';
import { auth, firebaseConfig } from '../../firebase/config';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
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
    const adminEmail = user.email;
    
    if (!createForm.password || createForm.password.length < 6) {
      toast.error('Password must be at least 6 characters long.');
      return;
    }
    
    try {
      // 1. Initialize a secondary Firebase instance so we don't log out the Admin
      const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      
      // 2. Create the new Firebase Auth account using the secondary instance
      const cred = await createUserWithEmailAndPassword(secondaryAuth, createForm.email, createForm.password);
      
      // 3. Create the Firestore staff document
      await addDocument('staff', {
        name: createForm.name,
        email: createForm.email,
        authUid: cred.user.uid,
        role: createForm.role,
        status: 'active',
        createdAt: new Date().toISOString()
      });
      
      // 4. Send password reset email
      await sendPasswordResetEmail(secondaryAuth, createForm.email);
      
      // 5. Sign out the secondary instance to clean up
      await secondaryAuth.signOut();
      
      // 6. Log action
      await logAction(user, 'Created new staff account & sent reset', { email: createForm.email, role: createForm.role });
      
      toast.success(`Account created! A password reset email has been sent to ${createForm.name}.`);
      setIsCreateModalOpen(false);
      setCreateForm({ name: '', email: '', role: 'Sales Staff', password: '' });
      
    } catch (err) {
      console.error('Staff creation error:', err);
      if (err.code === 'auth/email-already-in-use') {
        toast.error('This email is already registered in Firebase Auth.');
      } else {
        toast.error('Failed to create staff account: ' + err.message);
      }
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

  const myData = staff.find(s => s.email === user.email);

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
              {!loading && filteredStaff.length === 0 && (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state flex-col flex-center gap-3 p-8">
                      <div className="icon-bg-large bg-light text-secondary mb-2 rounded-full p-4"><UserMinus size={48} opacity={0.5} /></div>
                      <h3 className="text-lg font-medium">No staff members found</h3>
                      <p className="text-secondary text-center max-w-sm">There are no staff members matching your current search.</p>
                      {searchTerm && <button className="btn-outline mt-2" onClick={() => setSearchTerm('')}>Clear Search</button>}
                    </div>
                  </td>
                </tr>
              )}
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
                <label className="label">Password</label>
                <input type="password" className="input-field" value={createForm.password} onChange={e => setCreateForm({...createForm, password: e.target.value})} required minLength={6} placeholder="Min. 6 characters" />
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
