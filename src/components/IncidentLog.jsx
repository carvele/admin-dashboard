import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  FileText,
  Plus,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Send,
  X,
} from 'lucide-react';
import { addIncidentLog, subscribeToIncidentLogs } from '../firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import './IncidentLog.css';

const INCIDENT_TYPES = [
  { value: 'policy_violation', label: 'Policy Violation' },
  { value: 'theft', label: 'Theft / Shoplifting' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'misconduct', label: 'Misconduct' },
  { value: 'fraud', label: 'Fraud / Scam' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'verbal_abuse', label: 'Verbal Abuse' },
  { value: 'tardiness', label: 'Tardiness / Absence' },
  { value: 'insubordination', label: 'Insubordination' },
  { value: 'other', label: 'Other' },
];

const ACTION_OPTIONS = [
  { value: 'warned', label: 'Warning Issued' },
  { value: 'suspended', label: 'Account Suspended' },
  { value: 'banned', label: 'Permanently Banned' },
  { value: 'noted', label: 'Noted (No Action)' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'resolved', label: 'Resolved' },
];

/**
 * IncidentLog — reusable audit & incident tracking panel.
 *
 * @param {string} entityId    - Firestore doc ID of the staff member or customer
 * @param {string} entityType  - 'staff' | 'customer'
 * @param {string} entityName  - Display name for the entity
 */
const IncidentLog = ({ entityId, entityType, entityName }) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    incidentType: '',
    description: '',
    actionTaken: '',
  });

  useEffect(() => {
    if (!entityId) return;
    setLoadingLogs(true);
    const unsub = subscribeToIncidentLogs(entityId, (data) => {
      setLogs(data);
      setLoadingLogs(false);
    });
    return () => unsub();
  }, [entityId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.incidentType) {
      toast.error('Select an incident type.');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Provide a description of the incident.');
      return;
    }
    if (!form.actionTaken) {
      toast.error('Select an action taken.');
      return;
    }

    setSubmitting(true);
    try {
      await addIncidentLog({
        entityId,
        entityType,
        entityName,
        incidentType: form.incidentType,
        description: form.description.trim(),
        actionTaken: form.actionTaken,
        reportedBy: user?.uid || user?.docId || 'unknown',
        reportedByName: user?.name || user?.email || 'Admin',
      });
      toast.success('Incident logged successfully.');
      setForm({ incidentType: '', description: '', actionTaken: '' });
      setShowForm(false);
    } catch (err) {
      console.error('Failed to log incident:', err);
      toast.error('Failed to log incident.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'Just now';
    const date = ts.toDate ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getIncidentLabel = (value) =>
    INCIDENT_TYPES.find((t) => t.value === value)?.label || value;

  const getActionLabel = (value) =>
    ACTION_OPTIONS.find((a) => a.value === value)?.label || value;

  const getActionColor = (action) => {
    switch (action) {
      case 'warned': return '#f59e0b';
      case 'suspended': return '#ef4444';
      case 'banned': return '#991b1b';
      case 'noted': return '#6b7280';
      case 'under_review': return '#8b5cf6';
      case 'resolved': return '#10b981';
      default: return '#6b7280';
    }
  };

  return (
    <div className="incident-log-section">
      <div
        className="incident-log-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-center gap-2">
          <ShieldAlert size={18} className="incident-header-icon" />
          <h4 className="incident-title">
            Incident Log
            {logs.length > 0 && (
              <span className="incident-count">{logs.length}</span>
            )}
          </h4>
        </div>
        <div className="flex-center gap-2">
          {expanded && (
            <button
              className="incident-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowForm((v) => !v);
              }}
              title="Log New Incident"
            >
              <Plus size={14} />
              Log Incident
            </button>
          )}
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {expanded && (
        <div className="incident-log-body">
          {/* ── New Incident Form ── */}
          {showForm && (
            <form className="incident-form" onSubmit={handleSubmit}>
              <div className="incident-form-row">
                <div className="form-group flex-1">
                  <label className="label">Incident Type <span className="req">*</span></label>
                  <select
                    className={`input-field ${!form.incidentType ? 'text-secondary' : ''}`}
                    value={form.incidentType}
                    onChange={(e) => setForm({ ...form, incidentType: e.target.value })}
                  >
                    <option value="" disabled>Select type...</option>
                    {INCIDENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '0 0 180px' }}>
                  <label className="label">Action Taken <span className="req">*</span></label>
                  <select
                    className={`input-field ${!form.actionTaken ? 'text-secondary' : ''}`}
                    value={form.actionTaken}
                    onChange={(e) => setForm({ ...form, actionTaken: e.target.value })}
                  >
                    <option value="" disabled>Select action...</option>
                    {ACTION_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Description <span className="req">*</span></label>
                <textarea
                  className="input-field"
                  style={{ minHeight: 80, resize: 'vertical' }}
                  placeholder="Describe the incident in detail..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="incident-form-actions">
                <button
                  type="button"
                  className="btn-outline small"
                  onClick={() => {
                    setShowForm(false);
                    setForm({ incidentType: '', description: '', actionTaken: '' });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger small flex-center gap-1"
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : <><Send size={14} /> Submit Report</>}
                </button>
              </div>
            </form>
          )}

          {/* ── Timeline ── */}
          {loadingLogs ? (
            <div className="incident-empty">
              <Clock size={16} className="text-secondary" />
              <span>Loading incident history...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="incident-empty">
              <FileText size={16} className="text-secondary" />
              <span>No incidents on record. Clean history.</span>
            </div>
          ) : (
            <div className="incident-timeline">
              {logs.map((log) => (
                <div className="incident-entry" key={log.id}>
                  <div className="incident-dot" style={{ borderColor: getActionColor(log.actionTaken) }} />
                  <div className="incident-card">
                    <div className="incident-card-top">
                      <span className="incident-type-badge">
                        <AlertTriangle size={12} />
                        {getIncidentLabel(log.incidentType)}
                      </span>
                      <span
                        className="incident-action-badge"
                        style={{
                          background: getActionColor(log.actionTaken) + '18',
                          color: getActionColor(log.actionTaken),
                          borderColor: getActionColor(log.actionTaken) + '40',
                        }}
                      >
                        {getActionLabel(log.actionTaken)}
                      </span>
                    </div>
                    <p className="incident-desc">{log.description}</p>
                    <div className="incident-meta">
                      <span>
                        <Clock size={12} /> {formatTimestamp(log.timestamp)}
                      </span>
                      <span>by {log.reportedByName || 'Admin'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IncidentLog;
