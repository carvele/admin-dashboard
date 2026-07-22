import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, ChevronLeft, ChevronRight, ChevronDown, Search } from 'lucide-react';
import { getPaginatedLogs } from '../../lib/supabaseService';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import debounce from 'lodash.debounce';
import './ActivityLog.css';

const PAGE_SIZE = 25;

const TARGET_TYPES = [
  { value: '', label: 'All Targets' },
  { value: 'product', label: 'Products' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'profile', label: 'Accounts' },
  { value: 'reservation', label: 'Reservations' },
  { value: 'device', label: 'Devices' },
];

const ActivityLog = () => {
  const { user } = useAuth();
  const canView = can(user?.role, 'view_logs');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  // Filters
  const [targetType, setTargetType] = useState('');
  const [actionSearch, setActionSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async (pageNum, filters) => {
    setLoading(true);
    const { rows: data, total: count } = await getPaginatedLogs(pageNum, PAGE_SIZE, filters);
    setRows(data);
    setTotal(count);
    setLoading(false);
  }, []);

  const buildFilters = useCallback(() => {
    const f = {};
    if (targetType) f.targetType = targetType;
    if (actionSearch.trim()) f.actionSearch = actionSearch.trim();
    if (dateFrom) f.from = new Date(dateFrom).toISOString();
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      f.to = end.toISOString();
    }
    return f;
  }, [targetType, actionSearch, dateFrom, dateTo]);

  // Reload on filter change (debounced for the text field), reset to page 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedLoad = useCallback(debounce((filters) => {
    setPage(0);
    load(0, filters);
  }, 350), [load]);

  useEffect(() => {
    if (!canView) return;
    debouncedLoad(buildFilters());
    return () => debouncedLoad.cancel();
  }, [canView, buildFilters, debouncedLoad]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (p) => {
    setPage(p);
    setExpanded(null);
    load(p, buildFilters());
  };

  if (!canView) {
    return (
      <div className="page-container">
        <div className="card p-6 text-center text-secondary">
          You don&apos;t have permission to view the activity log.
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title flex-center gap-2 justify-start">
            <ScrollText size={24} /> Activity Log
          </h1>
          <p className="page-subtitle">Every recorded admin action — who did what, and when</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card al-filters">
        <div className="al-search">
          <Search size={16} />
          <input
            type="text"
            className="input-field"
            placeholder="Search actions… (e.g. restock, archived)"
            value={actionSearch}
            onChange={(e) => setActionSearch(e.target.value)}
          />
        </div>
        <select
          className="input-field al-filter-select"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value)}
        >
          {TARGET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          type="date"
          className="input-field al-filter-date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="From date"
        />
        <input
          type="date"
          className="input-field al-filter-date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="To date"
        />
      </div>

      {/* Log table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="al-empty">Loading activity…</div>
        ) : rows.length === 0 ? (
          <div className="al-empty">No log entries match the current filters.</div>
        ) : (
          <table className="al-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    className={`al-row ${expanded === log.id ? 'al-row-open' : ''}`}
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <td className="al-when">
                      {new Date(log.timestamp).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="al-who">{log.userName || 'System'}</td>
                    <td className="al-action">{log.action}</td>
                    <td className="al-target">
                      {log.targetType ? (
                        <span className={`al-target-chip al-target-${log.targetType}`}>
                          {log.targetType}
                        </span>
                      ) : (
                        <span className="text-secondary">—</span>
                      )}
                    </td>
                    <td className="al-expand">
                      <ChevronDown
                        size={16}
                        className={expanded === log.id ? 'al-chevron-open' : ''}
                      />
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr className="al-details-row">
                      <td colSpan={5}>
                        <div className="al-details">
                          {log.targetId && (
                            <div><strong>Target ID:</strong> <code>{log.targetId}</code></div>
                          )}
                          {log.details && Object.keys(log.details).length > 0 ? (
                            <pre>{JSON.stringify(log.details, null, 2)}</pre>
                          ) : (
                            <span className="text-secondary">No extra details recorded.</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="al-pagination">
        <span className="text-secondary">
          {total} entries · page {page + 1} of {totalPages}
        </span>
        <div className="al-page-btns">
          <button
            className="btn-outline btn-sm flex-center gap-1"
            disabled={page === 0 || loading}
            onClick={() => goToPage(page - 1)}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <button
            className="btn-outline btn-sm flex-center gap-1"
            disabled={page + 1 >= totalPages || loading}
            onClick={() => goToPage(page + 1)}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivityLog;
