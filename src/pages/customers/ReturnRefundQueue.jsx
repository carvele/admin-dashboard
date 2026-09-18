/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Clock,
  CheckCircle,
  XCircle,
  HelpCircle,
  DollarSign,
  Image as ImageIcon,
  ChevronRight,
  RefreshCw,
  Package,
} from 'lucide-react';
import { getReturnRefundRequests } from '../../services/reservationService';
import ReturnRefundDetailModal from './ReturnRefundDetailModal';
import SkeletonTable from '../../components/SkeletonTable';
import { formatCurrency } from '../../utils/helpers';
import { can } from '../../utils/permissions';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';

const REASON_LABELS = {
  size_fit: 'Size / Fit',
  damaged_defective: 'Damaged / Defective',
  wrong_item: 'Wrong Item',
  not_as_described: 'Not as Described',
  changed_mind: 'Changed Mind',
  other: 'Other',
};

const formatManilaDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) {
    return dateStr;
  }
};

export default function ReturnRefundQueue({ onDisburseReservation }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusTab, setStatusTab] = useState('active_queue'); // 'active_queue' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'refunded' | 'all'
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const canDisburse = can(user?.role, 'refund', 'disburse') || user?.role === 'owner' || user?.role === 'admin';

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReturnRefundRequests();
      setRequests(data || []);
    } catch (err) {
      console.error('Failed to fetch return refund requests:', err);
      toast.error('Failed to load return and refund requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // The modal is opened with a snapshot from `requests`. After approve/reject/
  // disburse, onRefresh reloads `requests` but the modal keeps rendering the
  // stale snapshot unless it's swapped for the matching fresh object here.
  useEffect(() => {
    if (!selectedRequest) return;
    const updated = requests.find((r) => r.id === selectedRequest.id);
    if (updated && updated !== selectedRequest) {
      setSelectedRequest(updated);
    }
  }, [requests, selectedRequest]);

  // Counts for tabs and metrics
  const counts = useMemo(() => {
    const res = {
      submitted: 0,
      under_review: 0,
      approved: 0,
      rejected: 0,
      refunded: 0,
      active_queue: 0,
    };
    requests.forEach((r) => {
      const st = r.status;
      if (res[st] !== undefined) res[st]++;
      if (st === 'submitted' || st === 'under_review') {
        res.active_queue++;
      }
    });
    return res;
  }, [requests]);

  // Filtered requests based on active tab and search
  const filteredRequests = useMemo(() => {
    let list = requests;

    if (statusTab === 'active_queue') {
      list = list.filter((r) => r.status === 'submitted' || r.status === 'under_review');
    } else if (statusTab !== 'all') {
      list = list.filter((r) => r.status === statusTab);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter((r) => {
        const res = r.reservations || {};
        const cust = r.customer || {};
        const dispId = (res.displayId || res.display_id || '').toLowerCase();
        const custName = (cust.fullName || cust.full_name || res.customerName || res.customer_name || '').toLowerCase();
        const custEmail = (cust.email || '').toLowerCase();
        const reason = (r.reasonCategory || r.reason_category || '').toLowerCase();
        const details = (r.details || '').toLowerCase();

        return (
          dispId.includes(term) ||
          custName.includes(term) ||
          custEmail.includes(term) ||
          reason.includes(term) ||
          details.includes(term)
        );
      });
    }

    return list;
  }, [requests, statusTab, searchTerm]);

  const handleOpenDetail = (req) => {
    setSelectedRequest(req);
    setIsDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setSelectedRequest(null);
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'submitted':
        return <span className="badge badge-warning flex-center gap-1"><Clock size={12} /> Submitted</span>;
      case 'under_review':
        return <span className="badge badge-info flex-center gap-1"><HelpCircle size={12} /> Under Review</span>;
      case 'approved':
        return <span className="badge badge-purple flex-center gap-1"><CheckCircle size={12} /> Approved</span>;
      case 'rejected':
        return <span className="badge badge-danger flex-center gap-1"><XCircle size={12} /> Rejected</span>;
      case 'refunded':
        return <span className="badge badge-success flex-center gap-1"><DollarSign size={12} /> Refunded</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Metric Stat Cards */}
      <div className="res-summary-grid">
        <div
          className={`card res-stat-card ${statusTab === 'active_queue' ? 'active-stat' : ''}`}
          onClick={() => setStatusTab('active_queue')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setStatusTab('active_queue');
            }
          }}
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
        >
          <div className="icon-bg-soft orange">
            <Clock size={24} />
          </div>
          <div className="res-stat-content">
            <p className="stat-label">Pending Review</p>
            <h3>{counts.active_queue}</h3>
            <span className="stat-sub">{counts.submitted} submitted &bull; {counts.under_review} under review</span>
          </div>
        </div>

        <div
          className={`card res-stat-card ${statusTab === 'approved' ? 'active-stat' : ''}`}
          onClick={() => setStatusTab('approved')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setStatusTab('approved');
            }
          }}
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
        >
          <div className="icon-bg-soft purple">
            <DollarSign size={24} />
          </div>
          <div className="res-stat-content">
            <p className="stat-label">Approved & Awaiting Refund</p>
            <h3>{counts.approved}</h3>
            <span className="stat-sub">Refund liability active</span>
          </div>
        </div>

        <div
          className={`card res-stat-card ${statusTab === 'refunded' ? 'active-stat' : ''}`}
          onClick={() => setStatusTab('refunded')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setStatusTab('refunded');
            }
          }}
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
        >
          <div className="icon-bg-soft green">
            <CheckCircle size={24} />
          </div>
          <div className="res-stat-content">
            <p className="stat-label">Disbursed Refunds</p>
            <h3>{counts.refunded}</h3>
            <span className="stat-sub">Completed settlements</span>
          </div>
        </div>

        <div
          className={`card res-stat-card ${statusTab === 'rejected' ? 'active-stat' : ''}`}
          onClick={() => setStatusTab('rejected')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setStatusTab('rejected');
            }
          }}
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
        >
          <div className="icon-bg-soft red">
            <XCircle size={24} />
          </div>
          <div className="res-stat-content">
            <p className="stat-label">Rejected Requests</p>
            <h3>{counts.rejected}</h3>
            <span className="stat-sub">Claims closed without refund</span>
          </div>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="card">
        {/* Card Toolbar */}
        <div className="card-toolbar" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          {/* Sub-tab Navigation */}
          <div className="view-toggle" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <button
              type="button"
              className={`toggle-btn ${statusTab === 'active_queue' ? 'active' : ''}`}
              onClick={() => setStatusTab('active_queue')}
            >
              Action Required {counts.active_queue > 0 && <span className="badge badge-warning" style={{ marginLeft: '6px' }}>{counts.active_queue}</span>}
            </button>
            <button
              type="button"
              className={`toggle-btn ${statusTab === 'submitted' ? 'active' : ''}`}
              onClick={() => setStatusTab('submitted')}
            >
              Submitted {counts.submitted > 0 && <span className="badge badge-warning" style={{ marginLeft: '6px' }}>{counts.submitted}</span>}
            </button>
            <button
              type="button"
              className={`toggle-btn ${statusTab === 'under_review' ? 'active' : ''}`}
              onClick={() => setStatusTab('under_review')}
            >
              Under Review {counts.under_review > 0 && <span className="badge badge-info" style={{ marginLeft: '6px' }}>{counts.under_review}</span>}
            </button>
            <button
              type="button"
              className={`toggle-btn ${statusTab === 'approved' ? 'active' : ''}`}
              onClick={() => setStatusTab('approved')}
            >
              Approved {counts.approved > 0 && <span className="badge badge-purple" style={{ marginLeft: '6px' }}>{counts.approved}</span>}
            </button>
            <button
              type="button"
              className={`toggle-btn ${statusTab === 'rejected' ? 'active' : ''}`}
              onClick={() => setStatusTab('rejected')}
            >
              Rejected
            </button>
            <button
              type="button"
              className={`toggle-btn ${statusTab === 'refunded' ? 'active' : ''}`}
              onClick={() => setStatusTab('refunded')}
            >
              Refunded
            </button>
            <button
              type="button"
              className={`toggle-btn ${statusTab === 'all' ? 'active' : ''}`}
              onClick={() => setStatusTab('all')}
            >
              All Requests ({requests.length})
            </button>
          </div>

          {/* Search and Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search return requests…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-outline flex-center"
              onClick={loadRequests}
              disabled={loading}
              title="Refresh requests"
              style={{ padding: '0.5rem 0.75rem' }}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Requests Table */}
        <div className="table-container">
          {loading ? (
            <SkeletonTable rows={5} columns={6} />
          ) : filteredRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--text-secondary)' }}>
              <Package size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>No return/refund requests found</h4>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                {searchTerm
                  ? 'No requests match your current search query.'
                  : statusTab === 'active_queue'
                  ? 'There are no pending return requests requiring staff review.'
                  : `No requests found in ${statusTab.replace('_', ' ')} status.`}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Customer</th>
                  <th>Reason Category</th>
                  <th>Photo Evidence</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const res = req.reservations || {};
                  const cust = req.customer || {};
                  const dispId = res.displayId || res.display_id || res.id;
                  const custName = cust.fullName || cust.full_name || res.customerName || res.customer_name || 'Guest';

                  return (
                    <tr
                      key={req.id}
                      onClick={() => handleOpenDetail(req)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong style={{ color: 'var(--accent, #9b2c2c)' }}>{dispId}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Total: {formatCurrency(res.totalAmount || res.total_amount || 0)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Submitted {formatManilaDate(req.submittedAt || req.submitted_at)}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 500 }}>{custName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {cust.email || cust.phoneNumber || 'No contact'}
                        </div>
                      </td>

                      <td>
                        <span style={{ fontWeight: 500 }}>
                          {REASON_LABELS[req.reasonCategory || req.reason_category] || (req.reasonCategory || req.reason_category)}
                        </span>
                        {req.details && (
                          <p
                            style={{
                              margin: '2px 0 0',
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {req.details}
                          </p>
                        )}
                      </td>

                      <td>
                        {req.photoPath ? (
                          <span className="badge badge-subtle flex-center gap-1" style={{ width: 'fit-content' }}>
                            <ImageIcon size={12} /> Attached
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>None</span>
                        )}
                      </td>

                      <td>
                        {renderStatusBadge(req.status)}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDetail(req);
                          }}
                        >
                          Review <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
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

      {/* Detail Modal */}
      {isDetailOpen && selectedRequest && (
        <ReturnRefundDetailModal
          request={selectedRequest}
          isOpen={isDetailOpen}
          onClose={handleCloseDetail}
          onRefresh={loadRequests}
          onDisburse={onDisburseReservation}
          canDisburse={canDisburse}
        />
      )}
    </div>
  );
}
