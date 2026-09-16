import { useState, useEffect } from 'react';
import {
  fetchAllAppVersionPolicies,
  updateAppVersionPolicy,
  setGlobalVersionEnforcementBypass,
  fetchAppVersionAuditLog,
} from '../../services/appVersionService';

export default function AppVersionSettings() {
  const [policies, setPolicies] = useState({ android: null, ios: null });
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Platform edit state
  const [selectedPlatform, setSelectedPlatform] = useState('android');
  const [formData, setFormData] = useState({
    min_version: '1.0.0',
    min_build_number: 1,
    latest_version: '1.0.0',
    latest_build_number: 1,
    emergency_bypass_enabled: false,
    title: 'Update Required',
    message: '',
    store_url: '',
    store_fallback_url: '',
  });

  // Modal confirmation state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Global bypass modal
  const [globalBypassModalOpen, setGlobalBypassModalOpen] = useState(false);
  const [targetBypassState, setTargetBypassState] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [policiesData, logs] = await Promise.all([
        fetchAllAppVersionPolicies(),
        fetchAppVersionAuditLog(15),
      ]);
      setPolicies(policiesData);
      setAuditLogs(logs || []);

      const activePolicy = policiesData[selectedPlatform];
      if (activePolicy) {
        setFormData({
          min_version: activePolicy.min_version || '1.0.0',
          min_build_number: activePolicy.min_build_number || 1,
          latest_version: activePolicy.latest_version || '1.0.0',
          latest_build_number: activePolicy.latest_build_number || 1,
          emergency_bypass_enabled: Boolean(activePolicy.emergency_bypass_enabled),
          title: activePolicy.title || 'Update Required',
          message: activePolicy.message || '',
          store_url: activePolicy.store_url || '',
          store_fallback_url: activePolicy.store_fallback_url || '',
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load app version policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedPlatform]);

  const handlePlatformChange = (platform) => {
    setSelectedPlatform(platform);
  };

  const handleSaveAttempt = (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Validate SemVer syntax
    const semVerRegex = /^\d+\.\d+\.\d+$/;
    if (!semVerRegex.test(formData.min_version.trim())) {
      setError('Minimum version must be strict MAJOR.MINOR.PATCH format (e.g. 1.1.0)');
      return;
    }
    if (!semVerRegex.test(formData.latest_version.trim())) {
      setError('Latest version must be strict MAJOR.MINOR.PATCH format (e.g. 1.1.0)');
      return;
    }

    setConfirmationInput('');
    setConfirmModalOpen(true);
  };

  const executeSavePolicy = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const confirmationText = `Confirmed version ${formData.min_version} (build ${formData.min_build_number}) for ${selectedPlatform}`;
      await updateAppVersionPolicy(selectedPlatform, formData, confirmationText);
      setSuccessMsg(`Successfully updated version policy for ${selectedPlatform.toUpperCase()}`);
      setConfirmModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to update version policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeGlobalBypass = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const confirmationText = targetBypassState
        ? 'Operator enabled global emergency bypass across all platforms'
        : 'Operator restored normal version enforcement across all platforms';
      await setGlobalVersionEnforcementBypass(targetBypassState, confirmationText);
      setSuccessMsg(
        targetBypassState
          ? 'Emergency Bypass ENABLED: All client versions are permitted globally'
          : 'Emergency Bypass DISABLED: Normal version enforcement restored'
      );
      setGlobalBypassModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to update global emergency bypass');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBypassActive =
    Boolean(policies.android?.emergency_bypass_enabled) &&
    Boolean(policies.ios?.emergency_bypass_enabled);

  const confirmationRequiredString = formData.min_version;
  const isConfirmationMatched = confirmationInput.trim() === confirmationRequiredString.trim();

  if (loading) {
    return <div className="p-8 text-secondary">Loading version governance policies...</div>;
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">App Version Governance</h1>
          <p className="text-secondary text-sm">
            Control minimum supported mobile versions, advisory update policies, and emergency bypass.
          </p>
        </div>

        {/* Global Emergency Bypass Button */}
        <div>
          <button
            type="button"
            onClick={() => {
              setTargetBypassState(!isBypassActive);
              setGlobalBypassModalOpen(true);
            }}
            className={`btn ${isBypassActive ? 'btn-danger' : 'btn-outline-danger'}`}
            style={{ fontWeight: 700 }}
          >
            {isBypassActive ? '⚠️ Bypass Active (Disable)' : '🚨 Enable Emergency Bypass'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-6 bg-red-100 border border-red-300 text-red-800 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 mb-6 bg-green-100 border border-green-300 text-green-800 rounded">
          {successMsg}
        </div>
      )}

      {/* Platform Selector Tabs */}
      <div className="flex border-b mb-6">
        <button
          type="button"
          onClick={() => handlePlatformChange('android')}
          className={`py-3 px-6 font-semibold border-b-2 ${
            selectedPlatform === 'android'
              ? 'border-black text-black'
              : 'border-transparent text-secondary hover:text-black'
          }`}
        >
          Android Policy
        </button>
        <button
          type="button"
          onClick={() => handlePlatformChange('ios')}
          className={`py-3 px-6 font-semibold border-b-2 ${
            selectedPlatform === 'ios'
              ? 'border-black text-black'
              : 'border-transparent text-secondary hover:text-black'
          }`}
        >
          iOS Policy
        </button>
      </div>

      {/* Version Policy Edit Form */}
      <form onSubmit={handleSaveAttempt} className="card p-6 mb-8 bg-white border rounded shadow-sm">
        <h2 className="text-lg font-bold mb-4">
          Edit {selectedPlatform.toUpperCase()} Policy Settings
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label" htmlFor="policy-min-version">Minimum Supported Version (Hard Block Threshold)</label>
            <input
              id="policy-min-version"
              type="text"
              className="input w-full"
              value={formData.min_version}
              onChange={(e) => setFormData({ ...formData, min_version: e.target.value })}
              placeholder="e.g. 1.1.0"
              required
            />
            <span className="text-xs text-secondary mt-1 block">
              Any client below this SemVer will be strictly hard-blocked.
            </span>
          </div>

          <div>
            <label className="label" htmlFor="policy-min-build">
              Minimum Build Number ({selectedPlatform === 'android' ? 'versionCode' : 'buildNumber'})
            </label>
            <input
              id="policy-min-build"
              type="number"
              className="input w-full"
              value={formData.min_build_number}
              onChange={(e) => setFormData({ ...formData, min_build_number: parseInt(e.target.value, 10) || 0 })}
              min="0"
              required
            />
            <span className="text-xs text-secondary mt-1 block">
              Build number evaluated if SemVer equals the minimum version.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label" htmlFor="policy-latest-version">Latest Available Version (Advisory / Soft Update)</label>
            <input
              id="policy-latest-version"
              type="text"
              className="input w-full"
              value={formData.latest_version}
              onChange={(e) => setFormData({ ...formData, latest_version: e.target.value })}
              placeholder="e.g. 1.2.0"
              required
            />
            <span className="text-xs text-secondary mt-1 block">
              Clients below this version will be shown a dismissible update advisory.
            </span>
          </div>

          <div>
            <label className="label" htmlFor="policy-latest-build">Latest Build Number</label>
            <input
              id="policy-latest-build"
              type="number"
              className="input w-full"
              value={formData.latest_build_number}
              onChange={(e) => setFormData({ ...formData, latest_build_number: parseInt(e.target.value, 10) || 0 })}
              min="0"
              required
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="label" htmlFor="policy-title">Barrier Modal Title</label>
          <input
            id="policy-title"
            type="text"
            className="input w-full"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            required
          />
        </div>

        <div className="mb-4">
          <label className="label" htmlFor="policy-message">Barrier Modal Message</label>
          <textarea
            id="policy-message"
            className="input w-full h-20"
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="label" htmlFor="policy-store-url">Store Deep-Link URL</label>
            <input
              id="policy-store-url"
              type="text"
              className="input w-full"
              value={formData.store_url}
              onChange={(e) => setFormData({ ...formData, store_url: e.target.value })}
              placeholder={selectedPlatform === 'android' ? 'market://details?id=...' : 'itms-apps://...'}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="policy-fallback-url">Fallback HTTPS Store URL</label>
            <input
              id="policy-fallback-url"
              type="url"
              className="input w-full"
              value={formData.store_fallback_url}
              onChange={(e) => setFormData({ ...formData, store_fallback_url: e.target.value })}
              placeholder="https://..."
              required
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            Review & Save Policy
          </button>
        </div>
      </form>

      {/* Audit Trail Section */}
      <div className="card p-6 bg-white border rounded shadow-sm">
        <h2 className="text-lg font-bold mb-4">Version Policy Audit History</h2>
        {auditLogs.length === 0 ? (
          <p className="text-secondary text-sm">No recorded changes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Timestamp</th>
                  <th className="py-2">Platform</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Operator</th>
                  <th className="py-2">Confirmation Note</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="py-2 uppercase font-semibold">{log.platform}</td>
                    <td className="py-2">
                      <span className="badge">{log.action}</span>
                    </td>
                    <td className="py-2 text-secondary">{log.operator_email || 'Service'}</td>
                    <td className="py-2 italic text-xs">{log.confirmation_text || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two-Step Save Confirmation Modal */}
      {confirmModalOpen && (
        <div className="modal-backdrop fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="modal-content bg-white rounded-lg p-6 max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold mb-2 text-red-600">
              Confirm {selectedPlatform.toUpperCase()} Version Gate
            </h3>
            <p className="text-sm text-secondary mb-4">
              Setting the minimum version to <strong>v{formData.min_version}</strong> will
              immediately <strong>hard-block</strong> all users running older versions of the {selectedPlatform.toUpperCase()} app.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-xs mb-4">
              <strong>Platform Verification:</strong> I confirm that version {formData.min_version} (build {formData.min_build_number}) is publicly available on{' '}
              {selectedPlatform === 'android' ? 'Google Play Store' : 'Apple App Store'}.
            </div>

            <div className="mb-4">
              <label className="label text-xs" htmlFor="confirm-token-input">
                To confirm, type <strong>{confirmationRequiredString}</strong> below:
              </label>
              <input
                id="confirm-token-input"
                type="text"
                className="input w-full"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder={confirmationRequiredString}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!isConfirmationMatched || isSubmitting}
                onClick={executeSavePolicy}
              >
                {isSubmitting ? 'Applying Gate...' : 'Confirm & Apply Gate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Emergency Bypass Modal */}
      {globalBypassModalOpen && (
        <div className="modal-backdrop fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="modal-content bg-white rounded-lg p-6 max-w-md w-full shadow-lg">
            <h3 className="text-lg font-bold mb-2 text-amber-700">
              {targetBypassState ? 'Enable Global Emergency Bypass?' : 'Disable Emergency Bypass?'}
            </h3>
            <p className="text-sm text-secondary mb-4">
              {targetBypassState
                ? 'This will immediately disable version enforcement across ALL mobile platforms simultaneously. All client versions will be permitted entry regardless of minimum policy.'
                : 'This will restore strict version enforcement according to the configured minimum policies for all platforms.'}
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGlobalBypassModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${targetBypassState ? 'btn-danger' : 'btn-primary'}`}
                disabled={isSubmitting}
                onClick={executeGlobalBypass}
              >
                {isSubmitting
                  ? 'Updating...'
                  : targetBypassState
                  ? 'Yes, Enable Bypass'
                  : 'Yes, Restore Enforcement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
