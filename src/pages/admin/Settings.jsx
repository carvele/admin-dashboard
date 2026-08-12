import React, { useState, useEffect } from 'react';
import {
  Save,
  Shield,
  Loader2,
  Image,
  Upload,
  Clock,
  Calendar,
  Trash2,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabaseClient';
import { getDocument, addDocument, updateDocument, upsertDocument, logAction } from '../../lib/supabaseService';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../lib/storage';
import './Settings.css';

const Settings = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('boutique');
  const [isLoading, setIsLoading] = useState(false);
  const [seedProgress, setSeedProgress] = useState(null);

  // Store Hours & Closures state
  const [weeklyHours, setWeeklyHours] = useState([
    { day_of_week: 0, day_name: 'Sunday', open_time: '10:00:00', close_time: '17:00:00', is_closed: true, slot_capacity: 3 },
    { day_of_week: 1, day_name: 'Monday', open_time: '09:00:00', close_time: '18:00:00', is_closed: false, slot_capacity: 3 },
    { day_of_week: 2, day_name: 'Tuesday', open_time: '09:00:00', close_time: '18:00:00', is_closed: false, slot_capacity: 3 },
    { day_of_week: 3, day_name: 'Wednesday', open_time: '09:00:00', close_time: '18:00:00', is_closed: false, slot_capacity: 3 },
    { day_of_week: 4, day_name: 'Thursday', open_time: '09:00:00', close_time: '18:00:00', is_closed: false, slot_capacity: 3 },
    { day_of_week: 5, day_name: 'Friday', open_time: '09:00:00', close_time: '18:00:00', is_closed: false, slot_capacity: 3 },
    { day_of_week: 6, day_name: 'Saturday', open_time: '09:00:00', close_time: '18:00:00', is_closed: false, slot_capacity: 3 },
  ]);
  const [closures, setClosures] = useState([]);
  const [newClosure, setNewClosure] = useState({ date: '', reason: '' });

  const [formData, setFormData] = useState({
    storeName: 'JezSy Collection',
    email: 'admin@jezsycollection.com',
    phone: '+63 912 345 6789',
    address: '123 Fashion Street, Makati City, Philippines',
    gcashName: '',
    gcashNumber: '',
    gcashQrUrl: '',
    // Reservation Rules
    maxBookingDays: 30,
    depositRequired: 50,
    cancellationWindow: 24,
    // AR Settings
    enableGlobalAR: true,
    autoApproveAR: false,
    maxFileSize: 10,
    // Account (Local update for display name only)
    displayName: '',
  });

  // Fetch settings, store_hours, and store_closures from Supabase on mount
  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        // Settings are stored as key/value rows in public.settings
        const { data: settingsRows, error: sErr } = await supabase.from('settings').select('key, value');
        if (!sErr && settingsRows) {
          const settingsMap = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]));
          setFormData((prev) => ({
            ...prev,
            ...(settingsMap.storeInfo || {}),
            ...(settingsMap.reservations || {}),
            ...(settingsMap.ar || {}),
            displayName: user?.name || '',
          }));
        }

        // Fetch store_hours
        const { data: hoursRows } = await supabase.from('store_hours').select('*').order('day_of_week', { ascending: true });
        if (hoursRows && hoursRows.length > 0) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const mapped = hoursRows.map(h => ({
            ...h,
            day_name: dayNames[h.day_of_week] || `Day ${h.day_of_week}`,
          }));
          setWeeklyHours(mapped);
        }

        // Fetch store_closures
        const { data: closureRows } = await supabase.from('store_closures').select('*').order('closure_date', { ascending: true });
        if (closureRows) {
          setClosures(closureRows);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
        toast.error('Failed to load settings.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveWeeklyHours = async () => {
    setIsLoading(true);
    try {
      const failedDays = [];
      for (const item of weeklyHours) {
        const { error } = await supabase.from('store_hours').upsert({
          day_of_week: item.day_of_week,
          open_time: item.open_time || '09:00:00',
          close_time: item.close_time || '18:00:00',
          is_closed: !!item.is_closed,
          slot_capacity: item.slot_capacity || 3,
        }, { onConflict: 'day_of_week' });
        // Not thrown -- a single bad day (e.g. close time before open time,
        // rejected by the DB's own CHECK constraint) shouldn't block the
        // other six days from saving, but it must not be silently dropped
        // either: this used to show "saved" even when a day's write failed
        // and quietly reverted to its previous stored value.
        if (error) failedDays.push(item.day_of_week);
      }
      if (failedDays.length > 0) {
        toast.error(`Could not save hours for: ${failedDays.join(', ')}. Check that close time is after open time.`);
      } else {
        toast.success('Weekly store hours saved and synced to Mobile!');
      }
      await logAction(user, 'Updated store operating hours');
    } catch (err) {
      toast.error('Failed to save store hours: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddClosure = async (e) => {
    e.preventDefault();
    if (!newClosure.date) {
      toast.error('Select a date for the shop closure');
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('store_closures').insert({
        closure_date: newClosure.date,
        is_fully_closed: true,
        reason: newClosure.reason || 'Closed for Holiday',
      }).select().single();

      if (error) throw error;
      setClosures(prev => [...prev, data]);
      setNewClosure({ date: '', reason: '' });
      toast.success(`Added shop closure for ${newClosure.date}!`);
      await logAction(user, 'Added shop closure date', { date: newClosure.date });
    } catch (err) {
      toast.error('Failed to add closure: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClosure = async (id) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.from('store_closures').delete().eq('id', id);
      if (error) throw error;
      setClosures(prev => prev.filter(c => c.id !== id));
      toast.success('Shop closure removed!');
      await logAction(user, 'Removed shop closure date');
    } catch (err) {
      toast.error('Failed to remove closure: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const now = new Date().toISOString();

      if (activeTab === 'boutique') {
        await supabase.from('settings').upsert({
          key: 'storeInfo',
          value: {
            storeName: formData.storeName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            gcashName: formData.gcashName || '',
            gcashNumber: formData.gcashNumber || '',
            gcashQrUrl: formData.gcashQrUrl || '',
          },
          updated_at: now,
        }, { onConflict: 'key' });
        toast.success('Boutique settings saved!');

      } else if (activeTab === 'reservation') {
        await supabase.from('settings').upsert({
          key: 'reservations',
          value: {
            maxBookingDays: formData.maxBookingDays,
            depositRequired: formData.depositRequired,
            cancellationWindow: formData.cancellationWindow,
          },
          updated_at: now,
        }, { onConflict: 'key' });
        toast.success('Reservation rules saved!');

      } else if (activeTab === 'ar') {
        await supabase.from('settings').upsert({
          key: 'ar',
          value: {
            enableGlobalAR: formData.enableGlobalAR,
            autoApproveAR: formData.autoApproveAR,
            maxFileSize: formData.maxFileSize,
          },
          updated_at: now,
        }, { onConflict: 'key' });
        toast.success('AR settings saved!');
      }

      await logAction(user, 'Updated ' + activeTab + ' settings');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handlePasswordReset = async () => {
    const email = user?.email;
    if (!email) { toast.error('No email address found for your account.'); return; }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${email}`);
      await logAction(user, 'Requested password reset');
    } catch (error) {
      toast.error(error.message || 'Failed to send reset email.');
    }
  };

  const handleGcashQrUpload = async (file) => {
    if (!file) return;
    setIsLoading(true);
    try {
      const result = await uploadToCloudinary(file);
      if (result?.secure_url) {
        setFormData((prev) => ({ ...prev, gcashQrUrl: result.secure_url }));
        toast.success('GCash QR Code uploaded! Please save settings to apply.');
      } else {
        toast.error('Upload failed — please try again.');
      }
    } catch (err) {
      toast.error('Image upload error: ' + err.message);
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
        <button
          className={`nav-tab ${activeTab === 'boutique' ? 'active' : ''}`}
          onClick={() => setActiveTab('boutique')}
        >
          Boutique Info
        </button>
        <button
          className={`nav-tab ${activeTab === 'hours' ? 'active' : ''}`}
          onClick={() => setActiveTab('hours')}
        >
          Store Hours & Closures
        </button>
        <button
          className={`nav-tab ${activeTab === 'reservation' ? 'active' : ''}`}
          onClick={() => setActiveTab('reservation')}
        >
          Reservation Rules
        </button>
        <button
          className={`nav-tab ${activeTab === 'ar' ? 'active' : ''}`}
          onClick={() => setActiveTab('ar')}
        >
          AR Try-On
        </button>
        <button
          className={`nav-tab ${activeTab === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
        </button>
        <button
          className={`nav-tab ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
      </div>

      <div className="settings-content-area card">
        <form onSubmit={handleSave} className="settings-form">

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
                <div className="section-header-icon" style={{ marginBottom: '1rem' }}>
                  <Shield size={18} className="text-secondary" />
                  <h3 className="section-title mb-0">Payment Information (GCash)</h3>
                </div>
                <div className="form-row">
                  <div className="form-group flex-1">
                    <label className="label">GCash Name</label>
                    <input
                      type="text"
                      name="gcashName"
                      className="input-field"
                      placeholder="e.g. Carl Vener Wee"
                      value={formData.gcashName || ''}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label className="label">GCash Number</label>
                    <input
                      type="text"
                      name="gcashNumber"
                      className="input-field"
                      placeholder="e.g. 0912 365 9917"
                      value={formData.gcashNumber || ''}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-group mt-3 mb-6">
                  <label className="label">GCash QR Code</label>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div 
                      style={{ 
                        width: '120px', 
                        height: '120px', 
                        background: 'var(--cream)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '12px',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        flexShrink: 0
                      }}
                    >
                      {formData.gcashQrUrl ? (
                        <img src={formData.gcashQrUrl} alt="GCash QR Code" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Image size={24} style={{ opacity: 0.5 }} />
                      )}
                      {isLoading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)' }}>
                          <Loader2 size={20} className="animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="btn-outline flex-center gap-2" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                        <Upload size={16} /> Upload QR Image
                        <input 
                          type="file" 
                          accept="image/*" 
                          style={{ display: 'none' }} 
                          onChange={(e) => handleGcashQrUpload(e.target.files[0])}
                          disabled={isLoading}
                        />
                      </label>
                      <p className="text-secondary text-sm mt-2">
                        Upload the QR Code that the Android app will display to users. Make sure to click "Save Settings" to apply changes!
                      </p>
                    </div>
                  </div>
                </div>
              </div>


            </div>
          )}

          {activeTab === 'hours' && (
            <div className="animate-fade-in">
              <div className="section-header-icon">
                <Clock size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Weekly Store Hours</h3>
              </div>
              <p className="text-secondary text-sm mb-4">
                Configure default store opening & closing times. Any day marked as Closed will automatically block appointment booking in Mobile and Admin.
              </p>

              <div className="table-responsive mb-6">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Status</th>
                      <th>Open Time</th>
                      <th>Close Time</th>
                      <th>Slots / 30m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyHours.map((item, idx) => (
                      <tr key={item.day_of_week}>
                        <td className="font-semibold">{item.day_name}</td>
                        <td>
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={!item.is_closed}
                              onChange={(e) => {
                                const val = !e.target.checked;
                                setWeeklyHours(prev => prev.map((h, i) => i === idx ? { ...h, is_closed: val } : h));
                              }}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                          <span className={`text-xs font-semibold ml-2 ${item.is_closed ? 'text-danger' : 'text-success'}`}>
                            {item.is_closed ? 'CLOSED' : 'OPEN'}
                          </span>
                        </td>
                        <td>
                          <input
                            type="time"
                            className="input-field small"
                            disabled={item.is_closed}
                            value={item.open_time ? item.open_time.slice(0, 5) : '09:00'}
                            onChange={(e) => {
                              const val = e.target.value + ':00';
                              setWeeklyHours(prev => prev.map((h, i) => i === idx ? { ...h, open_time: val } : h));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            className="input-field small"
                            disabled={item.is_closed}
                            value={item.close_time ? item.close_time.slice(0, 5) : '18:00'}
                            onChange={(e) => {
                              const val = e.target.value + ':00';
                              setWeeklyHours(prev => prev.map((h, i) => i === idx ? { ...h, close_time: val } : h));
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input-field small w-20"
                            min="1"
                            max="20"
                            disabled={item.is_closed}
                            value={item.slot_capacity ?? 3}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 3;
                              setWeeklyHours(prev => prev.map((h, i) => i === idx ? { ...h, slot_capacity: val } : h));
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                className="btn-primary mb-8"
                onClick={handleSaveWeeklyHours}
                disabled={isLoading}
              >
                <Save size={16} /> Save Weekly Hours
              </button>

              <hr className="my-6 border-border" />

              <div className="section-header-icon">
                <Calendar size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Shop Closures & Holidays</h3>
              </div>
              <p className="text-secondary text-sm mb-4">
                Close the boutique for a specific holiday or date (e.g. Christmas Day or staff event). This immediately blocks mobile appointments on that date.
              </p>

              <form onSubmit={handleAddClosure} className="flex gap-3 align-center mb-6 max-w-xl">
                <input
                  type="date"
                  className="input-field flex-1"
                  value={newClosure.date}
                  onChange={(e) => setNewClosure({ ...newClosure, date: e.target.value })}
                  required
                />
                <input
                  type="text"
                  className="input-field flex-1"
                  placeholder="Reason (e.g. Christmas Day)"
                  value={newClosure.reason}
                  onChange={(e) => setNewClosure({ ...newClosure, reason: e.target.value })}
                />
                <button type="submit" className="btn-primary" disabled={isLoading}>
                  <Plus size={16} /> Add Closure
                </button>
              </form>

              <div className="table-responsive max-w-xl">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Closure Date</th>
                      <th>Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closures.map((c) => (
                      <tr key={c.id}>
                        <td className="font-mono font-semibold">{c.closure_date}</td>
                        <td>{c.reason || 'Closed'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline small text-danger"
                            onClick={() => handleDeleteClosure(c.id)}
                            disabled={isLoading}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {closures.length === 0 && (
                      <tr>
                        <td colSpan="3" className="text-center text-secondary py-4">
                          No special closures set
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
              <p className="text-secondary text-sm mb-4">
                Set limits and boundaries for customer bookings.
              </p>

              <div className="form-group mt-4">
                <label className="label">Max Booking Days in Advance</label>
                <input
                  type="number"
                  name="maxBookingDays"
                  className="input-field"
                  value={formData.maxBookingDays}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group mt-4">
                <label className="label">Deposit Required (%)</label>
                <input
                  type="number"
                  name="depositRequired"
                  className="input-field"
                  value={formData.depositRequired}
                  onChange={handleChange}
                  min="0"
                  max="100"
                />
              </div>

              <div className="form-group mt-4">
                <label className="label">Free Cancellation Window (Hours)</label>
                <input
                  type="number"
                  name="cancellationWindow"
                  className="input-field"
                  value={formData.cancellationWindow}
                  onChange={handleChange}
                />
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
                  <input
                    type="checkbox"
                    name="enableGlobalAR"
                    checked={formData.enableGlobalAR}
                    onChange={handleChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group mt-4">
                <div className="toggle-info">
                  <h4>Auto-Approve Alignments</h4>
                  <p>
                    Skip manual verification step for newly uploaded 3D bodies if mesh validates.
                  </p>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    name="autoApproveAR"
                    checked={formData.autoApproveAR}
                    onChange={handleChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group mt-5">
                <label className="label">Max Assets File Size (MB)</label>
                <input
                  type="number"
                  name="maxFileSize"
                  className="input-field"
                  value={formData.maxFileSize}
                  onChange={handleChange}
                />
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
                <input
                  type="text"
                  name="displayName"
                  className="input-field"
                  value={formData.displayName}
                  onChange={handleChange}
                  readOnly
                />
                <p className="text-xs text-secondary mt-1">
                  To change your display name, contact the Owner.
                </p>
              </div>

              <div className="form-group mt-4">
                <label className="label">Staff Email Address</label>
                <input
                  type="email"
                  className="input-field"
                  value={user?.email || ''}
                  readOnly
                  disabled
                />
              </div>

              <div className="form-group mt-4">
                <label className="label">Role Level</label>
                <input
                  type="text"
                  className="input-field"
                  value={user?.role || 'Staff'}
                  readOnly
                  disabled
                />
              </div>

              <button
                type="button"
                className="btn-outline border-danger text-danger mt-4"
                onClick={handlePasswordReset}
              >
                Send Password Reset Email
              </button>
            </div>
          )}

          <div className="settings-footer max-w-lg">
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 size={16} className="mr-2 inline animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save size={16} className="mr-2 inline" /> Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Settings;
