import React, { useState, useEffect } from 'react';
import { Save, Shield, Loader2, Edit2, Image, Upload, Check, X, Lock, ChevronDown, ChevronRight, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getDocument, setDocument, logAction, addDocument, updateDocument } from '../../firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, getDocs, deleteDoc, doc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { uploadToCloudinary } from '../../firebase/storage';
import './Settings.css';

const PROTECTED_CATEGORIES = ['Tops', 'Bottoms', 'Outerwear', 'Dresses & Skirts', 'Innerwear', 'Accessories', 'Special Collections'];

const Settings = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('boutique');
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [uploadingCatId, setUploadingCatId] = useState(null);
  const [expandedCatId, setExpandedCatId] = useState(null);
  const [newSubCategory, setNewSubCategory] = useState('');
  const [seedProgress, setSeedProgress] = useState(null); // { step, totalSteps, message }

  const handleAddSubCategory = async (catId) => {
    if (!newSubCategory.trim()) return;
    try {
      setIsLoading(true);
      const category = categories.find(c => c.id === catId);
      const subcategories = category.subcategories || [];
      if (subcategories.includes(newSubCategory.trim())) {
        toast.error("Sub-category already exists!");
        return;
      }
      const updatedSubs = [...subcategories, newSubCategory.trim()];
      await updateDocument('categories', catId, { subcategories: updatedSubs });
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, subcategories: updatedSubs } : c));
      setNewSubCategory('');
      toast.success('Sub-category added!');
      await logAction(user, "Added sub-category to " + category.name + ": " + newSubCategory.trim());
    } catch (err) {
      toast.error('Failed to add sub-category: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSubCategory = async (catId, subName) => {
    if (!window.confirm(`Remove sub-category "${subName}"?`)) return;
    try {
      setIsLoading(true);
      const category = categories.find(c => c.id === catId);
      const updatedSubs = (category.subcategories || []).filter(s => s !== subName);
      await updateDocument('categories', catId, { subcategories: updatedSubs });
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, subcategories: updatedSubs } : c));
      toast.success('Sub-category removed!');
      await logAction(user, "Removed sub-category from " + category.name + ": " + subName);
    } catch (err) {
      toast.error('Failed to remove sub-category: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };
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

      await logAction(user, "Updated " + activeTab + " settings");
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
      await logAction(user, "Added new category: " + newCategory.trim());
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
      await logAction(user, "Deleted category: " + catName);
    } catch (err) {
      toast.error('Failed to delete category: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameCategory = async (catId) => {
    if (!editingCatName.trim()) return;
    try {
      setIsLoading(true);
      await updateDocument('categories', catId, { name: editingCatName.trim() });
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, name: editingCatName.trim() } : c));
      setEditingCatId(null);
      toast.success('Category renamed!');
      await logAction(user, "Renamed category to: " + editingCatName.trim());
    } catch (err) {
      toast.error('Failed to rename category: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCategoryImageUpload = async (catId, file) => {
    if (!file) return;
    setUploadingCatId(catId);
    try {
      const result = await uploadToCloudinary(file);
      if (result?.secure_url) {
        await updateDocument('categories', catId, { imageUrl: result.secure_url });
        setCategories(prev => prev.map(c => c.id === catId ? { ...c, imageUrl: result.secure_url } : c));
        toast.success('Category image updated!');
      } else {
        toast.error('Upload failed — please try again.');
      }
    } catch (err) {
      toast.error('Image upload error: ' + err.message);
    } finally {
      setUploadingCatId(null);
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
        <button className={`nav-tab ${activeTab === 'maintenance' ? 'active' : ''}`} onClick={() => setActiveTab('maintenance')}>Maintenance</button>
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
                <div style={{display:'flex', flexDirection:'column', gap:'0.75rem'}}>
                  {categories.map(cat => (
                    <div key={cat.id} style={{display:'flex', flexDirection:'column', gap:'0', border:'1px solid var(--border-color)', borderRadius:'10px', backgroundColor:'var(--white)', overflow:'hidden'}}>
                      <div style={{display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem'}}>
                        {/* Expand/Collapse */}
                        <button 
                          type="button" 
                          onClick={() => setExpandedCatId(expandedCatId === cat.id ? null : cat.id)}
                          style={{background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', color:'var(--text-secondary)'}}
                        >
                          {expandedCatId === cat.id ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                        </button>

                        {/* Category Image */}
                        <div style={{width:44, height:44, borderRadius:8, overflow:'hidden', flexShrink:0, backgroundColor:'var(--cream)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid var(--border-color)', position:'relative'}}>
                          {cat.imageUrl ? (
                            <img src={cat.imageUrl} alt={cat.name} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                          ) : (
                            <Image size={18} style={{color:'var(--text-secondary)', opacity:0.5}} />
                          )}
                          <label style={{position:'absolute', inset:0, cursor:'pointer', opacity:0}}>
                            <input type="file" accept="image/*" style={{display:'none'}} onChange={(e) => handleCategoryImageUpload(cat.id, e.target.files[0])} />
                          </label>
                          {uploadingCatId === cat.id && (
                            <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,255,255,0.8)'}}>
                              <Loader2 size={16} className="animate-spin" />
                            </div>
                          )}
                        </div>

                        {/* Category Name */}
                        <div style={{flex:1}}>
                          {editingCatId === cat.id ? (
                            <div style={{display:'flex', gap:'0.375rem', alignItems:'center'}}>
                              <input
                                type="text"
                                className="input-field"
                                value={editingCatName}
                                onChange={(e) => setEditingCatName(e.target.value)}
                                onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleRenameCategory(cat.id); } if(e.key === 'Escape') setEditingCatId(null); }}
                                autoFocus
                                style={{padding:'0.35rem 0.5rem', fontSize:'0.875rem'}}
                              />
                              <button type="button" onClick={() => handleRenameCategory(cat.id)} style={{color:'#10B981', background:'none', border:'none', cursor:'pointer', padding:'0.25rem'}}><Check size={16}/></button>
                              <button type="button" onClick={() => setEditingCatId(null)} style={{color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', padding:'0.25rem'}}><X size={16}/></button>
                            </div>
                          ) : (
                            <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                              <span style={{fontWeight:600, fontSize:'0.9rem'}}>{cat.name}</span>
                              {cat.subcategories?.length > 0 && (
                                <span style={{fontSize:'0.7rem', padding:'0.1rem 0.4rem', backgroundColor:'var(--cream)', borderRadius:'10px', color:'var(--text-secondary)'}}>{cat.subcategories.length} sub</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{display:'flex', gap:'0.375rem', alignItems:'center'}}>
                          {PROTECTED_CATEGORIES.includes(cat.name) ? (
                            <div title="System Protected" style={{color:'var(--text-secondary)', padding:'0.35rem', opacity:0.5}}>
                              <Lock size={14}/>
                            </div>
                          ) : (
                            <>
                              <button type="button" title="Rename" onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }} style={{color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', padding:'0.35rem'}}>
                                <Edit2 size={14}/>
                              </button>
                              <label title="Upload image" style={{color:'var(--text-secondary)', cursor:'pointer', padding:'0.35rem', display:'flex'}}>
                                <Upload size={14}/>
                                <input type="file" accept="image/*" style={{display:'none'}} onChange={(e) => handleCategoryImageUpload(cat.id, e.target.files[0])} />
                              </label>
                              <button
                                type="button"
                                title="Delete"
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                style={{color:'#DC2626', background:'none', border:'none', cursor:'pointer', padding:'0.35rem'}}
                              >
                                <X size={14}/>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Subcategories Panel */}
                      {expandedCatId === cat.id && (
                        <div style={{padding:'0 1rem 1rem 3.5rem', backgroundColor:'rgba(0,0,0,0.02)', borderTop:'1px solid var(--border-color)'}}>
                          <p style={{fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'var(--text-secondary)', margin:'0.75rem 0 0.5rem'}}>Sub-categories</p>
                          <div style={{display:'flex', flexWrap:'wrap', gap:'0.375rem', marginBottom:'0.75rem'}}>
                            {(cat.subcategories || []).map(sub => (
                              <div key={sub} style={{display:'flex', alignItems:'center', gap:'0.25rem', padding:'0.2rem 0.5rem', backgroundColor:'var(--white)', border:'1px solid var(--border-color)', borderRadius:'6px', fontSize:'0.75rem'}}>
                                <span>{sub}</span>
                                <button 
                                  type="button" 
                                  onClick={() => handleDeleteSubCategory(cat.id, sub)}
                                  style={{background:'none', border:'none', cursor:'pointer', padding:0, color:'#DC2626', display:'flex'}}
                                >
                                  <X size={12}/>
                                </button>
                              </div>
                            ))}
                            {(!cat.subcategories || cat.subcategories.length === 0) && (
                              <p style={{fontSize:'0.75rem', fontStyle:'italic', color:'var(--text-secondary)', opacity:0.7}}>No sub-categories yet.</p>
                            )}
                          </div>
                          
                          <div style={{display:'flex', gap:'0.375rem'}}>
                            <input 
                              type="text" 
                              className="input-field" 
                              placeholder="New sub-category..." 
                              value={newSubCategory}
                              onChange={(e) => setNewSubCategory(e.target.value)}
                              style={{flex:1, padding:'0.3rem 0.6rem', fontSize:'0.75rem', height:'auto'}}
                              onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddSubCategory(cat.id); } }}
                            />
                            <button 
                              type="button" 
                              className="btn-primary" 
                              onClick={() => handleAddSubCategory(cat.id)}
                              style={{padding:'0.3rem 0.6rem', fontSize:'0.75rem', borderRadius:'6px'}}
                              disabled={isLoading || !newSubCategory.trim()}
                            >
                              <PlusCircle size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
                      const { seedDemoData } = await import('../../utils/seedDemoData');
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

          {activeTab === 'maintenance' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Database Maintenance</h3>
              </div>
              <p className="text-secondary text-sm mb-4">Clean up test data and maintain database hygiene. These actions are <strong>irreversible</strong>.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                {/* Delete test users */}
                <div className="p-4 border rounded-lg" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>🧹 Purge Test Users</h4>
                      <p className="text-xs text-secondary">Delete all users with 'test' in their name or email.</p>
                    </div>
                    <button
                      type="button"
                      className="btn-outline border-danger text-danger text-xs"
                      disabled={isLoading}
                      onClick={async () => {
                        if (!window.confirm('Delete ALL users with "test" in their name/email? This cannot be undone.')) return;
                        setIsLoading(true);
                        try {
                          const snap = await getDocs(collection(db, 'users'));
                          let count = 0;
                          for (const d of snap.docs) {
                            const data = d.data();
                            const isTest = ((data.name || '') + (data.email || '')).toLowerCase().includes('test');
                            if (isTest) { await deleteDoc(doc(db, 'users', d.id)); count++; }
                          }
                          toast.success(`Deleted ${count} test users`);
                          await logAction(user, `Purged ${count} test users`);
                        } catch (err) { toast.error('Failed: ' + err.message); }
                        finally { setIsLoading(false); }
                      }}
                    >
                      Purge
                    </button>
                  </div>
                </div>

                {/* Delete test products */}
                <div className="p-4 border rounded-lg" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>🗑️ Purge Test Products</h4>
                      <p className="text-xs text-secondary">Delete all products with 'test' or 'demo' in their name.</p>
                    </div>
                    <button
                      type="button"
                      className="btn-outline border-danger text-danger text-xs"
                      disabled={isLoading}
                      onClick={async () => {
                        if (!window.confirm('Delete ALL products with "test" or "demo" in their name? This cannot be undone.')) return;
                        setIsLoading(true);
                        try {
                          const snap = await getDocs(collection(db, 'products'));
                          let count = 0;
                          for (const d of snap.docs) {
                            const name = (d.data().name || '').toLowerCase();
                            if (name.includes('test') || name.includes('demo')) { await deleteDoc(doc(db, 'products', d.id)); count++; }
                          }
                          toast.success(`Deleted ${count} test products`);
                          await logAction(user, `Purged ${count} test products`);
                        } catch (err) { toast.error('Failed: ' + err.message); }
                        finally { setIsLoading(false); }
                      }}
                    >
                      Purge
                    </button>
                  </div>
                </div>

                {/* Delete old reservations */}
                <div className="p-4 border rounded-lg" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>📋 Purge Old Reservations</h4>
                      <p className="text-xs text-secondary">Delete all completed or cancelled reservations older than 90 days.</p>
                    </div>
                    <button
                      type="button"
                      className="btn-outline border-danger text-danger text-xs"
                      disabled={isLoading}
                      onClick={async () => {
                        if (!window.confirm('Delete all completed/cancelled reservations older than 90 days?')) return;
                        setIsLoading(true);
                        try {
                          const snap = await getDocs(collection(db, 'reservations'));
                          const cutoff = Date.now() - (90 * 24 * 60 * 60 * 1000);
                          let count = 0;
                          for (const d of snap.docs) {
                            const data = d.data();
                            const status = (data.status || '').toLowerCase();
                            if (status === 'completed' || status === 'cancelled') {
                              const ts = data.reservationDate?.seconds ? data.reservationDate.seconds * 1000 : (data.timestamp || Date.now());
                              if (ts < cutoff) { await deleteDoc(doc(db, 'reservations', d.id)); count++; }
                            }
                          }
                          toast.success(`Deleted ${count} old reservations`);
                          await logAction(user, `Purged ${count} old reservations`);
                        } catch (err) { toast.error('Failed: ' + err.message); }
                        finally { setIsLoading(false); }
                      }}
                    >
                      Purge
                    </button>
                  </div>
                </div>

                {/* Password Cleanup Migration */}
                <div className="p-4 border rounded-lg" style={{ borderColor: 'var(--border-color)', marginBottom: '1rem' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem' }}>🔐 Cleanup Plaintext Passwords</h4>
                      <p className="text-xs text-secondary">Finds and deletes any old plaintext `password` fields from user documents, and backfills missing roles.</p>
                    </div>
                    <button
                      type="button"
                      className="btn-outline border-secondary text-xs"
                      disabled={isLoading}
                      onClick={async () => {
                        if (!window.confirm('Run the password cleanup migration on all user documents?')) return;
                        setIsLoading(true);
                        try {
                          const snap = await getDocs(collection(db, 'users'));
                          let cleaned = 0;
                          let skipped = 0;
                          let updated = 0;
                          
                          for (const d of snap.docs) {
                            const data = d.data();
                            const updates = {};
                            
                            if (data.password !== undefined) {
                              updates.password = deleteField();
                              cleaned++;
                            } else {
                              skipped++;
                            }
                            
                            if (!data.role) updates.role = 'customer';
                            if (!data.createdAt) updates.createdAt = serverTimestamp();
                            
                            if (Object.keys(updates).length > 0) {
                              await updateDoc(doc(db, 'users', d.id), updates);
                              updated++;
                            }
                          }
                          toast.success(`Migration complete! Removed ${cleaned} passwords, skipped ${skipped} clean docs.`);
                          await logAction(user, `Ran password cleanup migration: ${cleaned} removed, ${updated} total updated.`);
                        } catch (err) { 
                          toast.error('Migration failed: ' + err.message); 
                          console.error(err);
                        } finally { 
                          setIsLoading(false); 
                        }
                      }}
                    >
                      Run Migration
                    </button>
                  </div>
                </div>

                {/* Nuke all non-admin users */}
                <div className="p-4 border rounded-lg" style={{ borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.25rem', color: '#DC2626' }}>⚠️ Nuke All Customer Accounts</h4>
                      <p className="text-xs text-secondary">Delete every user account that is NOT admin/staff. <strong>Extremely destructive.</strong></p>
                    </div>
                    <button
                      type="button"
                      className="btn-outline border-danger text-danger text-xs"
                      disabled={isLoading}
                      onClick={async () => {
                        if (!window.confirm('⚠️ FINAL WARNING: This will permanently delete ALL customer accounts. Type "DELETE" to confirm.')) return;
                        const confirm2 = window.prompt('Type DELETE to confirm:');
                        if (confirm2 !== 'DELETE') { toast.info('Aborted.'); return; }
                        setIsLoading(true);
                        try {
                          const snap = await getDocs(collection(db, 'users'));
                          let count = 0;
                          for (const d of snap.docs) {
                            const role = (d.data().role || '').toLowerCase();
                            if (role !== 'admin' && role !== 'owner' && role !== 'staff') {
                              await deleteDoc(doc(db, 'users', d.id)); count++;
                            }
                          }
                          toast.success(`Deleted ${count} customer accounts`);
                          await logAction(user, `NUKE: Purged ${count} customer accounts`);
                        } catch (err) { toast.error('Failed: ' + err.message); }
                        finally { setIsLoading(false); }
                      }}
                    >
                      Nuke
                    </button>
                  </div>
                </div>
              </div>
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
