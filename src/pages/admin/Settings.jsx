import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Check,
  EyeOff,
  Eye,
  Save,
  Shield,
  Loader2,
  Image,
  Upload,
  MessageSquare,
  Sparkles,
  RotateCcw,
  Bot,
  Clock,
  Calendar,
  Trash2,
  Plus,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchSettings, fetchStoreHours, fetchStoreClosures, upsertStoreHour, insertStoreClosure, deleteStoreClosure, upsertSettings, requestPasswordReset } from '../../services/settingsService';
import { logAction } from '../../lib/supabaseService';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { uploadToCloudinary } from '../../lib/storage';
import { DEFAULT_AUTO_REPLY_MESSAGE } from '../../services/communicationService';
import AppVersionSettings from '../settings/AppVersionSettings';
import MfaSettings from '../settings/MfaSettings';
import './Settings.css';

const Settings = () => {
  const { user, isAdminUnlocked } = useAuth();
  const [activeTab, setActiveTab] = useState(isAdminUnlocked ? 'boutique' : 'security');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['boutique', 'hours', 'reservation', 'payments', 'ar', 'messaging', 'notifications', 'security', 'account', 'app-version'].includes(tabParam)) {
      if (!isAdminUnlocked && !['security', 'account'].includes(tabParam)) {
        setActiveTab('security');
      } else {
        setActiveTab(tabParam);
      }
    } else if (!isAdminUnlocked) {
      setActiveTab('security');
    }
  }, [isAdminUnlocked]);
  const [isLoading, setIsLoading] = useState(false);

  // Security / Change Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
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
    // Auto Reply Settings
    enableAutoReply: true,
    autoReplyMessage: DEFAULT_AUTO_REPLY_MESSAGE,
    // Manual Payment Instructions (customer-facing, gates the mobile app's
    // manual-transfer receipt-upload flow)
    manualPaymentEnabled: false,
    paymentGcashEnabled: false,
    paymentGcashAccountName: '',
    paymentGcashNumber: '',
    bankTransferEnabled: false,
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    manualPaymentInstructions: '',
    manualPaymentReferenceInstructions: '',
    // Account (Local update for display name only)
    displayName: '',
  });

  // Fetch settings, store_hours, and store_closures from Supabase on mount
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        // Settings key/value
        const settingsRows = await fetchSettings();
        const settingsMap = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value]));
        const autoReply = settingsMap.autoReply || {};
        const paymentInstructions = settingsMap.paymentInstructions || {};
        setFormData((prev) => ({
          ...prev,
          ...(settingsMap.storeInfo || {}),
          ...(settingsMap.reservations || {}),
          ...(settingsMap.ar || {}),
          enableAutoReply: autoReply.enabled ?? true,
          autoReplyMessage: autoReply.message || DEFAULT_AUTO_REPLY_MESSAGE,
          manualPaymentEnabled: paymentInstructions.manual_payment_enabled ?? false,
          paymentGcashEnabled: paymentInstructions.gcash_enabled ?? false,
          paymentGcashAccountName: paymentInstructions.gcash_account_name || '',
          paymentGcashNumber: paymentInstructions.gcash_number || '',
          bankTransferEnabled: paymentInstructions.bank_transfer_enabled ?? false,
          bankName: paymentInstructions.bank_name || '',
          bankAccountName: paymentInstructions.bank_account_name || '',
          bankAccountNumber: paymentInstructions.bank_account_number || '',
          manualPaymentInstructions: paymentInstructions.manual_payment_instructions || '',
          manualPaymentReferenceInstructions: paymentInstructions.manual_payment_reference_instructions || '',
          displayName: user?.name || '',
        }));

        // Store hours
        const hoursRows = await fetchStoreHours();
        if (hoursRows && hoursRows.length > 0) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const mapped = hoursRows.map((h) => ({
            ...h,
            day_name: dayNames[h.day_of_week] || `Day ${h.day_of_week}`,
          }));
          setWeeklyHours(mapped);
        }

        // Store closures
        const closureRows = await fetchStoreClosures();
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
    fetchAll();
    // Intentionally mount-only: user?.name seeds the initial displayName field.
    // Re-running on every user change would refetch all settings and clobber
    // any in-progress unsaved edits in this form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveWeeklyHours = async () => {
    setIsLoading(true);
    try {
      const failedDays = [];
      for (const item of weeklyHours) {
        try {
          await upsertStoreHour(item);
        } catch (_) {
          failedDays.push(item.day_of_week);
        }
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
        const data = await insertStoreClosure({
          closure_date: newClosure.date,
          is_fully_closed: true,
          reason: newClosure.reason || 'Closed for Holiday',
        });
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
      await deleteStoreClosure(id);
      setClosures(prev => prev.filter(c => c.closure_date !== id));
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
          await upsertSettings({
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
          });
          toast.success('Boutique settings saved!');
        } else if (activeTab === 'reservation') {
          await upsertSettings({
            key: 'reservations',
            value: {
              maxBookingDays: formData.maxBookingDays,
              depositRequired: formData.depositRequired,
              cancellationWindow: formData.cancellationWindow,
            },
            updated_at: now,
          });
          toast.success('Reservation rules saved!');
        } else if (activeTab === 'ar') {
          await upsertSettings({
            key: 'ar',
            value: {
              enableGlobalAR: formData.enableGlobalAR,
              autoApproveAR: formData.autoApproveAR,
              maxFileSize: formData.maxFileSize,
            },
            updated_at: now,
          });
          toast.success('AR settings saved!');
        } else if (activeTab === 'messaging') {
          await upsertSettings({
            key: 'autoReply',
            value: {
              enabled: Boolean(formData.enableAutoReply),
              message: formData.autoReplyMessage.trim() || DEFAULT_AUTO_REPLY_MESSAGE,
            },
            updated_at: now,
          });
          toast.success('Auto-acknowledgment settings saved!');
        } else if (activeTab === 'payments') {
          await upsertSettings({
            key: 'paymentInstructions',
            value: {
              manual_payment_enabled: Boolean(formData.manualPaymentEnabled),
              gcash_enabled: Boolean(formData.paymentGcashEnabled),
              gcash_account_name: formData.paymentGcashAccountName || '',
              gcash_number: formData.paymentGcashNumber || '',
              bank_transfer_enabled: Boolean(formData.bankTransferEnabled),
              bank_name: formData.bankName || '',
              bank_account_name: formData.bankAccountName || '',
              bank_account_number: formData.bankAccountNumber || '',
              manual_payment_instructions: formData.manualPaymentInstructions || '',
              manual_payment_reference_instructions: formData.manualPaymentReferenceInstructions || '',
            },
            updated_at: now,
          });
          toast.success('Payment instructions saved!');
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

    // ── Password Strength & Update ──────────────────────────────────────────────
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 12) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score <= 2) return { score: 1, label: 'Weak', color: 'var(--color-danger, #ef4444)' };
    if (score <= 3) return { score: 2, label: 'Fair', color: '#f59e0b' };
    if (score === 4) return { score: 3, label: 'Good', color: '#3b82f6' };
    return { score: 4, label: 'Strong', color: 'var(--color-success, #10b981)' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const handleUpdatePassword = async () => {
    if (!newPassword) {
      toast.error('Please enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match. Please verify and try again.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          must_change_password: false,
        },
      });

      if (error) {
        toast.error(error.message || 'Failed to update password');
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);

      toast.success('Your password has been changed successfully!');
      await logAction(user, 'Updated account password');
    } catch (err) {
      console.error('[Settings] Password update error:', err);
      toast.error('Unexpected error updating password: ' + (err?.message || 'Please try again.'));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handlePasswordReset = async () => {
    const email = user?.email;
    if (!email) { toast.error('No email address found for your account.'); return; }
    try {
      await requestPasswordReset(email, `${window.location.origin}/login`);
      toast.success('Password reset link sent to your email!');
    } catch (error) {
      toast.error('Error sending reset email: ' + error.message);
    }
  };

  const handleGcashQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const url = await uploadToCloudinary(file);
      setFormData((prev) => ({ ...prev, gcashQrUrl: url }));
      toast.success('GCash QR Code uploaded! Please save settings to apply.');
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
        {isAdminUnlocked && (
          <>
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
              className={`nav-tab ${activeTab === 'payments' ? 'active' : ''}`}
              onClick={() => setActiveTab('payments')}
            >
              Payment Methods
            </button>
            <button
              className={`nav-tab ${activeTab === 'ar' ? 'active' : ''}`}
              onClick={() => setActiveTab('ar')}
            >
              AR Try-On
            </button>
            <button
              className={`nav-tab ${activeTab === 'messaging' ? 'active' : ''}`}
              onClick={() => setActiveTab('messaging')}
            >
              Messaging & Auto-Reply
            </button>
            <button
              className={`nav-tab ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              Notifications
            </button>
            <button
              className={`nav-tab ${activeTab === 'app-version' ? 'active' : ''}`}
              onClick={() => setActiveTab('app-version')}
            >
              App Version Policy
            </button>
          </>
        )}
        <button
          className={`nav-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Security & 2FA
        </button>
        <button
          className={`nav-tab ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          Account
        </button>
      </div>

      <div className="settings-content-area">
        <form onSubmit={handleSave} className="settings-form">

          {activeTab === 'boutique' && (
            <div className="animate-fade-in">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Store Information</h3>
              </div>

              <div className="form-group max-w-lg mt-4">
                <label className="label" htmlFor="storeName">Store Name</label>
                <input autoComplete="off"
                  type="text"
                  id="storeName"
                  name="storeName"
                  className="input-field"
                  value={formData.storeName}
                  onChange={handleChange}
                />
              </div>

              <div className="form-row max-w-lg mt-3">
                <div className="form-group flex-1">
                  <label className="label" htmlFor="email">Email Address</label>
                  <input autoComplete="off"
                    type="email"
                    id="email"
                    name="email"
                    className="input-field"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="label" htmlFor="phone">Phone Number</label>
                  <input autoComplete="off"
                    type="text"
                    id="phone"
                    name="phone"
                    className="input-field"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-group max-w-lg mt-3">
                <label className="label" htmlFor="address">Store Address</label>
                <input autoComplete="off"
                  type="text"
                  id="address"
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
                    <label className="label" htmlFor="gcashName">GCash Name</label>
                    <input autoComplete="off"
                      type="text"
                      id="gcashName"
                      name="gcashName"
                      className="input-field"
                      placeholder="e.g. Carl Vener Wee"
                      value={formData.gcashName || ''}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label className="label" htmlFor="gcashNumber">GCash Number</label>
                    <input autoComplete="off"
                      type="text"
                      id="gcashNumber"
                      name="gcashNumber"
                      className="input-field"
                      placeholder="e.g. 0912 365 9917"
                      value={formData.gcashNumber || ''}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="form-group mt-3 mb-6">
                  <span className="label">GCash QR Code</span>
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
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--glass-bg)' }}>
                          <Loader2 size={20} className="animate-spin" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="btn-outline flex-center gap-2" style={{ cursor: 'pointer', display: 'inline-flex' }}>
                        <Upload size={16} /> Upload QR Image
                        <input autoComplete="off" id="field_dt2j7ws" name="field_dt2j7ws" 
                          type="file" 
                          accept="image/*" 
                          style={{ display: 'none' }} 
                          onChange={(e) => handleGcashQrUpload(e.target.files[0])}
                          disabled={isLoading}
                        />
                      </label>
                      <p className="text-secondary text-sm mt-2">
                        Upload the QR Code that the Android app will display to users. Make sure to click &quot;Save Settings&quot; to apply changes!
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

              <div className="table-container mb-6">
                <table className="hours-table">
                  <thead>
                    <tr>
                      <th style={{ width: '18%' }}>Day</th>
                      <th style={{ width: '22%' }}>Status</th>
                      <th style={{ width: '25%' }}>Open Time</th>
                      <th style={{ width: '25%' }}>Close Time</th>
                      <th style={{ width: '10%' }}>Slots / 30m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyHours.map((item, idx) => (
                      <tr key={item.day_of_week}>
                        <td className="hours-day-name">{item.day_name}</td>
                        <td>
                          <div className="hours-status-cell">
                            <label className="toggle-switch" aria-label={`Toggle ${item.day_name} open status`}>
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
                            <span className={`status-pill ${item.is_closed ? 'status-pill-closed' : 'status-pill-open'}`}>
                              {item.is_closed ? 'Closed' : 'Open'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <input autoComplete="off" id="field_ugpewqn" name="field_ugpewqn"
                            type="time"
                            className="hours-time-input"
                            disabled={item.is_closed}
                            value={item.open_time ? item.open_time.slice(0, 5) : '09:00'}
                            onChange={(e) => {
                              const val = e.target.value + ':00';
                              setWeeklyHours(prev => prev.map((h, i) => i === idx ? { ...h, open_time: val } : h));
                            }}
                          />
                        </td>
                        <td>
                          <input autoComplete="off" id="field_y5euq22" name="field_y5euq22"
                            type="time"
                            className="hours-time-input"
                            disabled={item.is_closed}
                            value={item.close_time ? item.close_time.slice(0, 5) : '18:00'}
                            onChange={(e) => {
                              const val = e.target.value + ':00';
                              setWeeklyHours(prev => prev.map((h, i) => i === idx ? { ...h, close_time: val } : h));
                            }}
                          />
                        </td>
                        <td>
                          <input autoComplete="off" id="field_1pripnp" name="field_1pripnp"
                            type="number"
                            className="hours-slot-input"
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

              <div className="hours-action-bar">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveWeeklyHours}
                  disabled={isLoading}
                >
                  <Save size={16} /> Save Weekly Hours
                </button>
              </div>

              <hr className="my-8 border-border" />

              <div className="section-header-icon">
                <Calendar size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Shop Closures & Holidays</h3>
              </div>
              <p className="text-secondary text-sm mb-6">
                Close the boutique for a specific holiday or date (e.g. Christmas Day or staff event). This immediately blocks mobile appointments on that date.
              </p>

              <form
                className="closures-form-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddClosure();
                }}
              >
                <div className="closures-form-grid">
                  <div className="form-group mb-0">
                    <label className="label" htmlFor="closure-date">Closure Date</label>
                    <input autoComplete="off"
                      id="closure-date"
                      type="date"
                      className="input-field"
                      value={newClosure.date}
                      onChange={(e) => setNewClosure({ ...newClosure, date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group mb-0">
                    <label className="label" htmlFor="closure-reason">Reason or Occasion</label>
                    <input autoComplete="off"
                      id="closure-reason"
                      type="text"
                      className="input-field"
                      placeholder="e.g. Christmas Day, Staff Retreat, Boutique Renovation"
                      value={newClosure.reason}
                      onChange={(e) => setNewClosure({ ...newClosure, reason: e.target.value })}
                    />
                  </div>
                  <div className="closures-btn-col">
                    <button
                      type="submit"
                      className="btn-primary w-full"
                      disabled={isLoading}
                    >
                      <Plus size={16} /> Add Closure
                    </button>
                  </div>
                </div>
              </form>

              <div className="table-container mt-4 mb-4">
                <table className="closures-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Closure Date</th>
                      <th style={{ width: '55%' }}>Reason</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closures.map((c) => (
                      <tr key={c.id}>
                        <td className="font-mono font-semibold">{c.closure_date}</td>
                        <td>{c.reason || 'Closed'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn-outline small text-danger"
                            onClick={() => handleDeleteClosure(c.closure_date)}
                            disabled={isLoading}
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    {closures.length === 0 && (
                      <tr>
                        <td colSpan="3" className="text-center text-secondary py-6">
                          No special closures configured yet.
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
                <label className="toggle-switch" aria-label="Toggle new reservation alerts">
                  <input type="checkbox" id="setting-alert-new-res" name="setting-alert-new-res" defaultChecked />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group max-w-lg">
                <div className="toggle-info">
                  <h4>Low Stock Alerts</h4>
                  <p>Receive Daily digests of items running low in stock</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle low stock alerts">
                  <input type="checkbox" id="setting-alert-low-stock" name="setting-alert-low-stock" defaultChecked />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group max-w-lg">
                <div className="toggle-info">
                  <h4>Direct Messages</h4>
                  <p>Sound alerts for incoming customer messages</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle direct message alerts">
                  <input type="checkbox" id="setting-alert-dm" name="setting-alert-dm" defaultChecked />
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
                <label className="label" htmlFor="maxBookingDays">Max Booking Days in Advance</label>
                <input autoComplete="off"
                  type="number"
                  id="maxBookingDays"
                  name="maxBookingDays"
                  className="input-field"
                  value={formData.maxBookingDays}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="depositRequired">Deposit Required (%)</label>
                <input autoComplete="off"
                  type="number"
                  id="depositRequired"
                  name="depositRequired"
                  className="input-field"
                  value={formData.depositRequired}
                  onChange={handleChange}
                  min="0"
                  max="100"
                />
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="cancellationWindow">Free Cancellation Window (Hours)</label>
                <input autoComplete="off"
                  type="number"
                  id="cancellationWindow"
                  name="cancellationWindow"
                  className="input-field"
                  value={formData.cancellationWindow}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <Wallet size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Manual Payment Instructions</h3>
              </div>
              <p className="text-secondary text-sm mb-4">
                Shown to customers in the mobile app before they submit a manual
                transfer receipt. Off by default until real account details are
                entered here.
              </p>

              <div className="toggle-group mt-4">
                <div className="toggle-info">
                  <h4>Enable Manual Payment</h4>
                  <p>Turn on the &quot;pay by transfer&quot; option in the mobile app.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle manual payment">
                  <input
                    type="checkbox"
                    name="manualPaymentEnabled"
                    checked={formData.manualPaymentEnabled}
                    onChange={handleChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group mt-4">
                <div className="toggle-info">
                  <h4>GCash Transfer</h4>
                  <p>Accept manual GCash transfers.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle GCash transfer">
                  <input
                    type="checkbox"
                    name="paymentGcashEnabled"
                    checked={formData.paymentGcashEnabled}
                    onChange={handleChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="paymentGcashAccountName">GCash Account Name</label>
                <input autoComplete="off"
                  type="text"
                  id="paymentGcashAccountName"
                  name="paymentGcashAccountName"
                  className="input-field"
                  value={formData.paymentGcashAccountName}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="paymentGcashNumber">GCash Number</label>
                <input autoComplete="off"
                  type="text"
                  id="paymentGcashNumber"
                  name="paymentGcashNumber"
                  className="input-field"
                  value={formData.paymentGcashNumber}
                  onChange={handleChange}
                />
              </div>

              <div className="toggle-group mt-5">
                <div className="toggle-info">
                  <h4>Bank Transfer</h4>
                  <p>Accept manual bank transfers.</p>
                </div>
                <label className="toggle-switch" aria-label="Toggle bank transfer">
                  <input
                    type="checkbox"
                    name="bankTransferEnabled"
                    checked={formData.bankTransferEnabled}
                    onChange={handleChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="bankName">Bank Name</label>
                <input autoComplete="off"
                  type="text"
                  id="bankName"
                  name="bankName"
                  className="input-field"
                  value={formData.bankName}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="bankAccountName">Bank Account Name</label>
                <input autoComplete="off"
                  type="text"
                  id="bankAccountName"
                  name="bankAccountName"
                  className="input-field"
                  value={formData.bankAccountName}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="bankAccountNumber">Bank Account Number</label>
                <input autoComplete="off"
                  type="text"
                  id="bankAccountNumber"
                  name="bankAccountNumber"
                  className="input-field"
                  value={formData.bankAccountNumber}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group mt-5">
                <label className="label" htmlFor="manualPaymentInstructions">Payment Instructions</label>
                <textarea
                  id="manualPaymentInstructions"
                  name="manualPaymentInstructions"
                  className="input-field"
                  rows={3}
                  value={formData.manualPaymentInstructions}
                  onChange={handleChange}
                  placeholder="e.g. Send the exact deposit amount and keep your reference number."
                />
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="manualPaymentReferenceInstructions">Reference Number Instructions</label>
                <textarea
                  id="manualPaymentReferenceInstructions"
                  name="manualPaymentReferenceInstructions"
                  className="input-field"
                  rows={2}
                  value={formData.manualPaymentReferenceInstructions}
                  onChange={handleChange}
                  placeholder="e.g. Copy the reference number shown on your GCash receipt."
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
                <label className="toggle-switch" aria-label="Toggle global AR try-on">
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
                <label className="toggle-switch" aria-label="Toggle auto-approve alignments">
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
                <label className="label" htmlFor="maxFileSize">Max Assets File Size (MB)</label>
                <input autoComplete="off"
                  type="number"
                  id="maxFileSize"
                  name="maxFileSize"
                  className="input-field"
                  value={formData.maxFileSize}
                  onChange={handleChange}
                />
              </div>
            </div>
          )}

          {activeTab === 'messaging' && (
            <div className="animate-fade-in max-w-xl">
              <div className="section-header-icon">
                <MessageSquare size={18} className="text-secondary" />
                <h3 className="section-title mb-0">Automatic Message Acknowledgment</h3>
              </div>

              <div className="toggle-group mt-4">
                <div className="toggle-info">
                  <h4>Enable Automatic Acknowledgment</h4>
                  <p>
                    Instantly send an automated response when a customer sends a message before staff manually replies.
                  </p>
                </div>
                <label className="toggle-switch" aria-label="Enable Automatic Acknowledgment">
                  <input
                    type="checkbox"
                    name="enableAutoReply"
                    checked={formData.enableAutoReply}
                    onChange={handleChange}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="form-group mt-5">
                <div className="flex-between mb-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="label mb-0" htmlFor="autoReplyMessage">Default Acknowledgment Message</label>
                  <button
                    type="button"
                    className="btn-text small text-secondary flex-center gap-1"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        autoReplyMessage: DEFAULT_AUTO_REPLY_MESSAGE,
                      }))
                    }
                    title="Reset message to default text"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--pink-accent)', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RotateCcw size={12} /> Reset to Default
                  </button>
                </div>
                <textarea autoComplete="off"
                  id="autoReplyMessage"
                  name="autoReplyMessage"
                  className="input-field textarea-field"
                  rows={4}
                  value={formData.autoReplyMessage}
                  onChange={handleChange}
                  placeholder="Enter automated acknowledgment message..."
                />
                <span className="helper-text">
                  This response is stored as an automated system message in the conversation thread.
                </span>
              </div>

              {/* Live Preview Card */}
              <div className="auto-reply-preview-container mt-5">
                <div className="preview-label flex-center gap-1" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--pink-accent)', marginBottom: '8px' }}>
                  <Sparkles size={14} />
                  <span>Live Preview (How it appears in Customer Chat)</span>
                </div>
                <div className="mock-chat-window">
                  <div className="mock-chat-bubble mock-customer">
                    <p>Hi, is the White Dress still available for reservation?</p>
                    <span className="mock-time">10:42 AM</span>
                  </div>
                  {formData.enableAutoReply ? (
                    <div className="mock-chat-bubble mock-auto-reply animate-fade-in">
                      <div className="mock-bot-badge">
                        <Bot size={12} />
                        <span>Automated Acknowledgment</span>
                      </div>
                      <p>{formData.autoReplyMessage || 'Default acknowledgment message...'}</p>
                      <span className="mock-time">10:42 AM</span>
                    </div>
                  ) : (
                    <div className="mock-chat-disabled-notice animate-fade-in">
                      ⚠️ Automatic acknowledgment is currently disabled. Customers will wait for a manual staff reply.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

                    {activeTab === 'security' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <ShieldCheck size={20} className="text-secondary" />
                <h3 className="section-title mb-0">Security & Authentication</h3>
              </div>

              <div className="security-overview-card">
                <div className="security-overview-icon">
                  <KeyRound size={22} />
                </div>
                <div className="security-overview-text">
                  <h4>Change Password</h4>
                  <p>
                    Set a secure permanent password for your staff account. Your new password must be at least 8 characters long.
                  </p>
                </div>
              </div>

              <div className="security-form-box">
                <div className="form-group">
                  <label className="label" htmlFor="newPassword">
                    New Password <span className="text-danger">*</span>
                  </label>
                  <div className="password-input-wrapper">
                    <input
                      id="newPassword"
                      name="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      className="input-field"
                      placeholder="Enter new password (min. 8 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={isUpdatingPassword}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      tabIndex={-1}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {newPassword && (
                  <div className="password-strength-container">
                    <div className="password-strength-meter">
                      <div
                        className="password-strength-bar"
                        style={{
                          width: `${(passwordStrength.score / 4) * 100}%`,
                          backgroundColor: passwordStrength.color,
                        }}
                      />
                    </div>
                    <div className="password-strength-info">
                      <span className="text-xs text-secondary">Password strength:</span>
                      <span className="text-xs font-semibold" style={{ color: passwordStrength.color }}>
                        {passwordStrength.label}
                      </span>
                    </div>
                  </div>
                )}

                <div className="form-group mt-3">
                  <label className="label" htmlFor="confirmPassword">
                    Confirm New Password <span className="text-danger">*</span>
                  </label>
                  <div className="password-input-wrapper">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="input-field"
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isUpdatingPassword}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-danger mt-1">Passwords do not match</p>
                  )}
                  {confirmPassword && newPassword === confirmPassword && (
                    <p className="text-xs text-success mt-1 flex-center gap-1" style={{ justifyContent: 'flex-start' }}>
                      <Check size={12} /> Passwords match
                    </p>
                  )}
                </div>

                <div className="password-guidelines-box">
                  <span className="guidelines-title">Requirements checklist:</span>
                  <ul className="guidelines-list">
                    <li className={newPassword.length >= 8 ? 'req-met' : ''}>
                      {newPassword.length >= 8 ? <Check size={13} className="text-success" /> : <span className="req-bullet">•</span>}
                      <span>At least 8 characters</span>
                    </li>
                    <li className={/[A-Z]/.test(newPassword) ? 'req-met' : ''}>
                      {/[A-Z]/.test(newPassword) ? <Check size={13} className="text-success" /> : <span className="req-bullet">•</span>}
                      <span>At least one uppercase letter (A-Z)</span>
                    </li>
                    <li className={/[0-9]/.test(newPassword) ? 'req-met' : ''}>
                      {/[0-9]/.test(newPassword) ? <Check size={13} className="text-success" /> : <span className="req-bullet">•</span>}
                      <span>At least one number (0-9)</span>
                    </li>
                    <li className={/[^A-Za-z0-9]/.test(newPassword) ? 'req-met' : ''}>
                      {/[^A-Za-z0-9]/.test(newPassword) ? <Check size={13} className="text-success" /> : <span className="req-bullet">•</span>}
                      <span>At least one special character (!@#$%&*)</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleUpdatePassword}
                    disabled={isUpdatingPassword || !newPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                  >
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 size={16} className="mr-2 inline animate-spin" /> Updating Password...
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </button>
                </div>
              </div>

              <MfaSettings />
            </div>
          )}

          {activeTab === 'account' && (
            <div className="animate-fade-in max-w-lg">
              <div className="section-header-icon">
                <Shield size={18} className="text-secondary" />
                <h3 className="section-title mb-0">My Account</h3>
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="displayName">Display Name</label>
                <input autoComplete="off"
                  type="text"
                  id="displayName"
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
                <label className="label" htmlFor="staffEmail">Staff Email Address</label>
                <input autoComplete="off"
                  type="email"
                  id="staffEmail"
                  className="input-field"
                  value={user?.email || ''}
                  readOnly
                  disabled
                />
              </div>

              <div className="form-group mt-4">
                <label className="label" htmlFor="roleLevel">Role Level</label>
                <input autoComplete="off"
                  type="text"
                  id="roleLevel"
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

          {activeTab === 'app-version' && (
            <div className="animate-fade-in">
              <AppVersionSettings />
            </div>
          )}

          {['boutique', 'reservation', 'payments', 'ar', 'messaging'].includes(activeTab) && (
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
          )}
        </form>
      </div>
    </div>
  );
};

export default Settings;
