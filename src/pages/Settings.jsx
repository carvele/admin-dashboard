import React, { useState, useEffect } from 'react';
import { Save, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getDocument, setDocument, logAction, addDocument } from '../firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import './Settings.css';

const Settings = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('boutique');
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [seedProgress, setSeedProgress] = useState(null); // { step, totalSteps, message }
  const [formData, setFormData] = useState({
    storeName: 'JezSy Collection',
    email: 'admin@jezsycollection.com',
    phone: '+63 912 345 6789',
    address: '123 Fashion Street, Makati City, Philippines',
    // Reservation Rules
    maxBookingDays: 30,
    depositRequired: 50,
    cancellationWindow: 24,
    // AR Settings
    enableGlobalAR: true,
    autoApproveAR: false,
    maxFileSize: 10,
    // Account (Local update for display name only)
    displayName: ''
  });

  // Fetch settings from Firestore on mount
  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const storeInfo = await getDocument('settings', 'storeInfo');
        const resRules = await getDocument('settings', 'reservations') || {};
        const arRules = await getDocument('settings', 'ar') || {};
        
        // Fetch categories
        const catSnap = await getDocs(collection(db, 'categories'));
        const cats = [];
        catSnap.forEach(snapDoc => cats.push({ id: snapDoc.id, ...snapDoc.data() }));
        setCategories(cats);
        
        setFormData(prev => ({
          ...prev,
          ...(storeInfo || {}),
          ...resRules,
          ...arRules,
          displayName: user?.name || ''
        }));
      } catch (error) {
        console.error("Error fetching settings:", error);
        toast.error("Failed to load settings.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (activeTab === 'boutique') {
        await setDocument('settings', 'storeInfo', {
          storeName: formData.storeName,
          email: formData.email,
          phone: formData.phone,
          address: formData.address
        });
      } else if (activeTab === 'reservation') {
        await setDocument('settings', 'reservations', {
          maxBookingDays: formData.maxBookingDays,
          depositRequired: formData.depositRequired,
          cancellationWindow: formData.cancellationWindow
        });
      } else if (activeTab === 'ar') {
        await setDocument('settings', 'ar', {
          enableGlobalAR: formData.enableGlobalAR,
          autoApproveAR: formData.autoApproveAR,
          maxFileSize: formData.maxFileSize
        });
      }
      // Note: 'account' does not directly save to settings doc, and notifications is a mock for now.

      await logAction(user, `Updated ${activeTab} settings`);
      toast.success(`${activeTab} settings saved successfully!`);
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error('Failed to save settings.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handlePasswordReset = async () => {
    const email = user?.email;
    if (!email) {
      toast.error('No email address found for your account.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(`Password reset email sent to ${email}`);
      await logAction(user, 'Requested password reset');
    } catch (error) {
      console.error('Password reset error:', error);
      toast.error(error.message || 'Failed to send reset email.');
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    try {
      setIsLoading(true);
      if (categories.some(c => c.name.toLowerCase() === newCategory.trim().toLowerCase())) {
        toast.error("Category already exists!");
        return;
      }
      const newDocId = await addDocument('categories', { name: newCategory.trim() });
      setCategories(prev => [...prev, { id: newDocId, name: newCategory.trim() }]);
      setNewCategory('');
      toast.success('Category added successfully!');
      await logAction(user, `Added new category: ${newCategory.trim()}`);
    } catch (err) {
      toast.error('Failed to add category: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (catId, catName) => {
    if (!window.confirm(`Are you sure you want to delete the category "${catName}"?`)) return;
    try {
      setIsLoading(true);
      await deleteDoc(doc(db, 'categories', catId));
      setCategories(prev => prev.filter(c => c.id !== catId));
      toast.success('Category deleted successfully!');
      await logAction(user, `Deleted category: ${catName}`);
    } catch (err) {
      toast.error('Failed to delete category: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header mb-2">
        <h1 className="page-title">System Settings</h1>
        <p className="page-subtitle">Configure boutique settings and system preferences</p>
      </div>

      <div className="settings-horizontal-nav">
        <button className={`nav-tab ${activeTab === 'boutique' ? 'active' : ''}`} onClick={() => setActiveTab('boutique')}>Boutique Info</button>
        <button className={`nav-tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>Categories</button>
        <button className={`nav-tab ${activeTab === 'reservation' ? 'active' : ''}`} onClick={() => setActiveTab('reservation')}>Reservation Rules</button>
        <button className={`nav-tab ${activeTab === 'ar' ? 'active' : ''}`} onClick={() => setActiveTab('ar')}>AR Try-On</button>
        <button className={`nav-tab ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>Notifications</button>
        <button className={`nav-tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>Account</button>
      </div>

      <div className="settings-content-area card">
        <form onSubmit={handleSave} className="settings-form">
          
          {activeTab === 'categories' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Product Categories</h3>
              </div>
              <p className="text-secondary text-sm mb-4">Manage the clothing categories available for your products.</p>
              
              <div className="flex gap-2 mt-4 mb-6">
                <input 
                  type="text" 
                  className="input-field flex-1" 
                  placeholder="New category name (e.g. Dresses)" 
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddCategory(e); } }}
                />
                <button type="button" className="btn-primary" onClick={handleAddCategory} disabled={isLoading || !newCategory.trim()}>
                  Add
                </button>
              </div>

              {categories.length === 0 ? (
                <p className="text-sm text-secondary">No custom categories found. Default categories will be used.</p>
              ) : (
                <ul className="space-y-2">
                  {categories.map(cat => (
                    <li key={cat.id} className="flex justify-between items-center p-3 border rounded-lg bg-[var(--surface-color)] hover:bg-[var(--surface-hover)] transition-colors">
                      <span className="font-medium text-sm">{cat.name}</span>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="text-danger hover:underline text-xs"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'boutique' && (
            <div className="animate-fade-in">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Store Information</h3>
              </div>
              
              <div className="form-group max-w-lg mt-4">
                <label className="label">Store Name</label>
                <input 
                  type="text" 
                  name="storeName"
                  className="input-field" 
                  value={formData.storeName} 
                  onChange={handleChange}
                />
              </div>
              
              <div className="form-row max-w-lg mt-3">
                <div className="form-group flex-1">
                  <label className="label">Email Address</label>
                  <input 
                    type="email" 
                    name="email"
                    className="input-field" 
                    value={formData.email} 
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Phone Number</label>
                  <input 
                    type="text" 
                    name="phone"
                    className="input-field" 
                    value={formData.phone} 
                    onChange={handleChange}
                  />
                </div>
              </div>
              
              <div className="form-group max-w-lg mt-3">
                <label className="label">Store Address</label>
                <input 
                  type="text" 
                  name="address"
                  className="input-field" 
                  value={formData.address} 
                  onChange={handleChange}
                />
              </div>

              <div className="form-group max-w-lg mt-6 pt-4 border-t">
                <h4 className="text-danger mb-2">Developer Tools</h4>
                <p className="text-secondary text-sm mb-3">Seed realistic demo data: customers, products, inventory, reservations, conversations, and messages.</p>
                {seedProgress && (
                  <div style={{marginBottom: '1rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem'}}>
                      <span>{seedProgress.message}</span>
                      <span>{seedProgress.step}/{seedProgress.totalSteps}</span>
                    </div>
                    <div style={{height: 6, borderRadius: 3, background: 'var(--border-color)', overflow: 'hidden'}}>
                      <div style={{height: '100%', width: `${(seedProgress.step / seedProgress.totalSteps) * 100}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.2s'}} />
                    </div>
                  </div>
                )}
                <button 
                  type="button" 
                  className="btn-outline border-danger text-danger"
                  disabled={!!seedProgress}
                  onClick={async () => {
                    if (!window.confirm('This will add demo data to your Firestore database. Continue?')) return;
                    try {
                      const { seedDemoData } = await import('../utils/seedDemoData');
                      const result = await seedDemoData((p) => setSeedProgress(p));
                      toast.success(`Seeded: ${result.customers} customers, ${result.products} products, ${result.reservations} reservations, ${result.conversations} conversations, ${result.messages} messages`);
                      await logAction(user, 'Seeded demo data', result);
                    } catch (err) {
                      toast.error('Seeding failed: ' + err.message);
                    } finally {
                      setSeedProgress(null);
                    }
                  }}
                >
                  {seedProgress ? 'Seeding in progress...' : '🌱 Seed Demo Data'}
                </button>
              </div>
            </div>
          )}


          {activeTab === 'notifications' && (
            <div className="animate-fade-in">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Notification Rules</h3>
              </div>
              
              <div className="toggle-group mt-4 max-w-lg">
                <div className="toggle-info">
                  <h4>New Reservations</h4>
                  <p>Receive alerts when a customer books a new reservation</p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" defaultChecked />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group max-w-lg">
                <div className="toggle-info">
                  <h4>Low Stock Alerts</h4>
                  <p>Receive Daily digests of items running low in stock</p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" defaultChecked />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group max-w-lg">
                <div className="toggle-info">
                  <h4>Direct Messages</h4>
                  <p>Sound alerts for incoming customer messages</p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" defaultChecked />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          )}
          
          {activeTab === 'reservation' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Reservation Rules</h3>
              </div>
              <p className="text-secondary text-sm mb-4">Set limits and boundaries for customer bookings.</p>
              
              <div className="form-group mt-4">
                <label className="label">Max Booking Days in Advance</label>
                <input type="number" name="maxBookingDays" className="input-field" value={formData.maxBookingDays} onChange={handleChange} />
              </div>

              <div className="form-group mt-4">
                <label className="label">Deposit Required (%)</label>
                <input type="number" name="depositRequired" className="input-field" value={formData.depositRequired} onChange={handleChange} min="0" max="100"/>
              </div>

              <div className="form-group mt-4">
                <label className="label">Free Cancellation Window (Hours)</label>
                <input type="number" name="cancellationWindow" className="input-field" value={formData.cancellationWindow} onChange={handleChange} />
              </div>
            </div>
          )}

          {activeTab === 'ar' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">AR Engine Config</h3>
              </div>
              
              <div className="toggle-group mt-4">
                <div className="toggle-info">
                  <h4>Enable Global AR Try-On</h4>
                  <p>Turn the AR Try-On feature on or off across the entire customer app.</p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="enableGlobalAR" checked={formData.enableGlobalAR} onChange={handleChange} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group mt-4">
                <div className="toggle-info">
                  <h4>Auto-Approve Alignments</h4>
                  <p>Skip manual verification step for newly uploaded 3D bodies if mesh validates.</p>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" name="autoApproveAR" checked={formData.autoApproveAR} onChange={handleChange} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group mt-5">
                <label className="label">Max Assets File Size (MB)</label>
                <input type="number" name="maxFileSize" className="input-field" value={formData.maxFileSize} onChange={handleChange} />
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">My Account</h3>
              </div>
              
              <div className="form-group mt-4">
                <label className="label">Display Name</label>
                <input type="text" name="displayName" className="input-field" value={formData.displayName} onChange={handleChange} readOnly />
                <p className="text-xs text-secondary mt-1">To change your display name, contact the Owner.</p>
              </div>

              <div className="form-group mt-4">
                <label className="label">Staff Email Address</label>
                <input type="email" className="input-field" value={user?.email || ''} readOnly disabled />
              </div>

              <div className="form-group mt-4">
                <label className="label">Role Level</label>
                <input type="text" className="input-field" value={user?.role || 'Staff'} readOnly disabled />
              </div>

              <button type="button" className="btn-outline border-danger text-danger mt-4" onClick={handlePasswordReset}>
                Send Password Reset Email
              </button>
            </div>
          )}

          <div className="settings-footer mt-5 pt-4 border-t max-w-lg">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 size={16} className="mr-2 inline animate-spin" /> Saving...</>
              ) : (
                <><Save size={16} className="mr-2 inline" /> Save Changes</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
