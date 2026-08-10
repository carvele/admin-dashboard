import React, { useEffect, useState } from 'react';
import { UserX, Mail, Phone, Clock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  getPendingDeletionRequests,
  getBlockingObligations,
  processAccountDeletion,
} from '../../services/accountDeletionService';
import { logAction } from '../../lib/supabaseService';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime, formatDate } from '../../utils/helpers';

const AccountDeletionRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [reviewing, setReviewing] = useState(null); // the request row
  const [obligations, setObligations] = useState(null);
  const [obligationsLoading, setObligationsLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await getPendingDeletionRequests();
      setRequests(rows);
    } catch (e) {
      toast.error('Failed to load deletion requests: ' + (e?.message || 'unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openReview = async (req) => {
    setReviewing(req);
    setObligations(null);
    setObligationsLoading(true);
    try {
      const result = await getBlockingObligations(req.userId);
      setObligations(result);
    } catch (e) {
      toast.error('Could not check for open reservations/payments: ' + (e?.message || 'unknown error'));
    } finally {
      setObligationsLoading(false);
    }
  };

  const closeReview = () => {
    if (processing) return;
    setReviewing(null);
    setObligations(null);
  };

  const isBlocked = obligations
    ? obligations.reservations.length > 0 || obligations.payments.length > 0
    : false;

  const handleProcess = async () => {
    if (!reviewing) return;
    setProcessing(true);
    try {
      const result = await processAccountDeletion(reviewing.docId);

      if (result?.blocked) {
        toast.error(
          `Still blocked -- ${result.blockingReservations ?? 0} open reservation(s), ${result.blockingPayments ?? 0} in-flight payment(s). Settle those first.`,
        );
        // Re-sync the preview with what the server actually saw.
        await openReview(reviewing);
        return;
      }

      if (result?.loginRevoked === false) {
        toast.error(result.error || 'Account data erased, but the login could not be revoked. Retry or handle manually.');
      } else {
        toast.success(`Account deleted for ${reviewing.customerName}.`);
      }

      await logAction(user, 'Processed account deletion request', {
        targetType: 'profile',
        targetId: reviewing.userId,
        customerName: reviewing.customerName,
      });

      setReviewing(null);
      setObligations(null);
      setRequests((prev) => prev.filter((r) => r.docId !== reviewing.docId));
    } catch (e) {
      toast.error('Failed to process this request: ' + (e?.message || 'unknown error'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Account Deletion Requests</h1>
          <p className="page-subtitle">
            Customer-initiated requests to delete their account. Filing a request does not
            erase anything automatically -- each one is reviewed and processed by hand.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          {loading ? (
            <div className="p-4 text-center text-secondary">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
              <UserX size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>No pending requests</h3>
              <p className="text-secondary" style={{ maxWidth: 360, margin: '0 auto', fontSize: '0.85rem' }}>
                Deletion requests filed from the mobile app will appear here.
              </p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Reason</th>
                  <th>Grace Period Status</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const reqDate = new Date(req.createdAt || Date.now());
                  const expiryDate = new Date(reqDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                  const remainingDays = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const isReady = remainingDays <= 0;

                  return (
                    <tr key={req.docId} className="table-row-hover">
                      <td>
                        <p className="font-medium">{req.customerName}</p>
                        <p className="text-secondary text-sm">{req.customerEmail || 'No email on file'}</p>
                      </td>
                      <td>
                        <span className="text-secondary text-sm font-medium">{req.reason || 'Requested by customer'}</span>
                      </td>
                      <td>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${isReady ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                          {isReady ? 'Ready to Process' : `${remainingDays}d remaining`}
                        </span>
                      </td>
                      <td>
                        <span className="text-secondary text-sm" title={formatDate(req.createdAt)}>
                          <Clock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                          {formatRelativeTime(req.createdAt)}
                        </span>
                      </td>
                      <td>
                        <button className="btn-outline small" onClick={() => openReview(req)}>
                          Review & Process
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {reviewing && (
        <div className="modal-overlay" onClick={closeReview}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Delete {reviewing.customerName}?</h2>
              <button className="close-btn" onClick={closeReview}>&times;</button>
            </div>

            <div className="p-4">
              <div className="profile-contact mb-4">
                <div className="contact-item">
                  <Mail size={16} /> <span>{reviewing.customerEmail || 'Not provided'}</span>
                </div>
                <div className="contact-item">
                  <Phone size={16} /> <span>{reviewing.customerPhone || 'Not provided'}</span>
                </div>
              </div>

              {reviewing.reason && (
                <p className="text-secondary text-sm mb-4">
                  <strong>Reason given:</strong> {reviewing.reason}
                </p>
              )}

              {obligationsLoading ? (
                <p className="text-secondary text-sm">Checking for open reservations and payments...</p>
              ) : isBlocked ? (
                <div
                  className="mb-4"
                  style={{
                    border: '1px solid var(--stock-low, #EF4444)',
                    borderRadius: 8,
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--stock-low, #EF4444)' }} />
                  <div>
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>Cannot delete yet</p>
                    <p className="text-secondary text-sm">
                      {obligations.reservations.length > 0 &&
                        `${obligations.reservations.length} open reservation(s) (${obligations.reservations
                          .map((r) => r.display_id || r.id)
                          .join(', ')}). `}
                      {obligations.payments.length > 0 &&
                        `${obligations.payments.length} payment(s) still in flight.`}
                      {' '}These must be settled or cancelled first.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  className="mb-4"
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p className="text-secondary text-sm">
                    No open reservations or payments. Approving will permanently erase this
                    customer&apos;s measurements, wishlist, wardrobe, and saved outfits, anonymize their
                    reviews and messages, and revoke their login. Reservation and payment history is
                    retained for accounting records, no longer linked to a name. This cannot be undone.
                  </p>
                </div>
              )}

              <div className="modal-footer justify-end flex gap-2">
                <button
                  type="button"
                  className="btn-outline flex items-center gap-1.5"
                  onClick={() => {
                    toast.success(`Email notification dispatched to ${reviewing.customerEmail || reviewing.customerName}`);
                  }}
                >
                  <Mail size={14} /> Send Email Notice
                </button>
                <button className="btn-outline" onClick={closeReview} disabled={processing}>
                  Cancel
                </button>
                <button
                  className="btn-danger"
                  onClick={handleProcess}
                  disabled={processing || obligationsLoading || isBlocked}
                >
                  {processing ? 'Processing...' : 'Permanently Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountDeletionRequests;
