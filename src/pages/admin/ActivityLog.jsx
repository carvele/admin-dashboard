import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  PackagePlus,
  Shield,
  Send,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { getPaginatedLogs } from '../../lib/supabaseService';
import { getStaffMembers } from '../../services/staffService';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import debounce from 'lodash.debounce';
import {
  getActionKind,
  ACTION_KIND_LABELS,
  formatLogSentence,
  extractChanges,
  extractContext,
  relativeTime,
  absoluteTime,
  groupLogsByDay,
  initialsOf,
  avatarColor,
} from '../../utils/activityLogFormat';
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

const KIND_ICONS = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  restore: RotateCcw,
  stock: PackagePlus,
  auth: Shield,
  message: Send,
  neutral: Activity,
};

const getTargetLink = (targetType, targetId) => {
  if (!targetId || !targetType) return null;
  const type = String(targetType).toLowerCase();
  if (type === 'product' || type === 'inventory') {
    return { url: `/catalog/view/${targetId}`, label: 'View Product' };
  }
  if (type === 'reservation') {
    return { url: `/reservations?search=${encodeURIComponent(targetId)}`, label: 'View Reservation' };
  }
  if (type === 'profile' || type === 'staff') {
    return { url: `/staff/${targetId}`, label: 'View Profile' };
  }
  return null;
};

const ActivityLog = () => {
  const { user } = useAuth();
  const canView = can(user?.role, 'view_logs');
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // full log object for the drawer
  const [showRaw, setShowRaw] = useState(false);
  const [actors, setActors] = useState([]);

  // Filters (initialized from URL search params for deep-linking)
  const [targetType, setTargetType] = useState(() => searchParams.get('targetType') || '');
  const [targetId, setTargetId] = useState(() => searchParams.get('targetId') || '');
  const [actionSearch, setActionSearch] = useState(
    () => searchParams.get('actionSearch') || searchParams.get('action') || '',
  );
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') || '');
  const [dateTo, setDateTo] = useState(() => searchParams.get('to') || '');
  const [actorId, setActorId] = useState(
    () => searchParams.get('userId') || searchParams.get('actorId') || '',
  );

  // Focus restore: the row button that opened the drawer.
  const lastTriggerRef = useRef(null);
  const drawerRef = useRef(null);

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
    if (targetId) f.targetId = targetId;
    if (actionSearch.trim()) f.actionSearch = actionSearch.trim();
    if (actorId) f.userId = actorId;
    if (dateFrom) f.from = new Date(dateFrom).toISOString();
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      f.to = end.toISOString();
    }
    return f;
  }, [targetType, targetId, actionSearch, dateFrom, dateTo, actorId]);

  // Reload on filter change (debounced for the text field), reset to page 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedLoad = useCallback(
    debounce((filters) => {
      setPage(0);
      load(0, filters);
    }, 350),
    [load],
  );

  useEffect(() => {
    if (!canView) return;
    debouncedLoad(buildFilters());
    return () => debouncedLoad.cancel();
  }, [canView, buildFilters, debouncedLoad]);

  // Actor filter options. Failure is non-fatal — the filter simply stays empty.
  useEffect(() => {
    if (!canView) return;
    getStaffMembers()
      .then((staff) => setActors(staff.filter((s) => s.name || s.email)))
      .catch(() => setActors([]));
  }, [canView]);

  const hasFilters = Boolean(
    targetType || targetId || actionSearch.trim() || dateFrom || dateTo || actorId,
  );

  const clearFilters = () => {
    setTargetType('');
    setTargetId('');
    setActionSearch('');
    setDateFrom('');
    setDateTo('');
    setActorId('');
    setSearchParams({});
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goToPage = (p) => {
    setPage(p);
    setSelected(null);
    load(p, buildFilters());
  };

  const openDrawer = (log, evt) => {
    lastTriggerRef.current = evt?.currentTarget ?? null;
    setSelected(log);
    setShowRaw(false);
  };

  const closeDrawer = useCallback(() => {
    setSelected(null);
    // Return focus to the row that opened it.
    if (lastTriggerRef.current?.focus) lastTriggerRef.current.focus();
  }, []);

  // Esc to close; arrow keys to walk entries while the drawer is open.
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const idx = rows.findIndex((r) => r.id === selected.id);
      if (idx === -1) return;
      const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= rows.length) return;
      e.preventDefault();
      setSelected(rows[nextIdx]);
      setShowRaw(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, rows, closeDrawer]);

  // Move focus into the drawer when it opens.
  useEffect(() => {
    if (selected && drawerRef.current) drawerRef.current.focus();
  }, [selected]);

  const groups = useMemo(() => groupLogsByDay(rows), [rows]);

  if (!canView) {
    return (
      <div className="page-container">
        <div className="card p-6 text-center text-secondary">
          You don&apos;t have permission to view the activity log.
        </div>
      </div>
    );
  }

  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title flex-center gap-2 justify-start">
            <ScrollText size={24} className="al-title-icon" /> Activity Log
            <span className="al-count-badge">{total.toLocaleString()} recorded</span>
          </h1>
          <p className="page-subtitle">Every recorded admin action — who did what, and when</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card al-filters">
        <div className="al-filter-field al-filter-grow">
          <label className="al-filter-label" htmlFor="al-search">Search actions</label>
          <div className="al-search">
            <Search size={16} aria-hidden="true" />
            <input
              id="al-search"
              type="text"
              className="input-field"
              placeholder="e.g. restock, archived"
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
            />
            {actionSearch && (
              <button
                type="button"
                className="al-search-clear"
                onClick={() => setActionSearch('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="al-filter-field">
          <label className="al-filter-label" htmlFor="al-target">Target</label>
          <select
            id="al-target"
            className="input-field"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
          >
            {TARGET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="al-filter-field">
          <label className="al-filter-label" htmlFor="al-actor">Performed by</label>
          <select
            id="al-actor"
            className="input-field"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
          >
            <option value="">Anyone</option>
            {actors.map((a) => (
              <option key={a.docId} value={a.docId}>{a.name || a.email}</option>
            ))}
          </select>
        </div>

        <div className="al-filter-field">
          <label className="al-filter-label" htmlFor="al-from">From</label>
          <input
            id="al-from"
            type="date"
            className="input-field"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="al-filter-field">
          <label className="al-filter-label" htmlFor="al-to">To</label>
          <input
            id="al-to"
            type="date"
            className="input-field"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        {hasFilters && (
          <button type="button" className="btn-outline btn-sm al-clear-filters" onClick={clearFilters}>
            <X size={14} /> Clear filters
          </button>
        )}
      </div>

      {hasFilters && !loading && (
        <p className="al-result-count">
          Showing {rows.length} of {total.toLocaleString()} matching {total === 1 ? 'entry' : 'entries'}
        </p>
      )}

      {/* Log feed */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="al-empty">Loading activity…</div>
        ) : rows.length === 0 ? (
          <div className="al-empty">No log entries match the current filters.</div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="al-group">
              <h2 className="al-group-header">{group.label}</h2>
              <ul className="al-list">
                {group.items.map((log) => {
                  const kind = getActionKind(log.action);
                  const Icon = KIND_ICONS[kind] || Activity;
                  const s = formatLogSentence(log);
                  const av = avatarColor(log.userId || log.userName || '');
                  const isOpen = selected?.id === log.id;
                  const targetLink = getTargetLink(log.targetType, log.targetId);

                  return (
                    <li key={log.id}>
                      <button
                        type="button"
                        className={`al-entry ${isOpen ? 'al-entry-open' : ''}`}
                        onClick={(e) => openDrawer(log, e)}
                        aria-expanded={isOpen}
                      >
                        <span className={`al-kind al-kind-${kind}`} title={ACTION_KIND_LABELS[kind]}>
                          <Icon size={15} aria-hidden="true" />
                          <span className="al-sr-only">{ACTION_KIND_LABELS[kind]}</span>
                        </span>

                        <span
                          className="al-avatar"
                          style={{ backgroundColor: av.bg, color: av.fg }}
                          aria-hidden="true"
                        >
                          {initialsOf(log.userName || 'System')}
                        </span>

                        <span className="al-entry-body">
                          <span className="al-sentence">
                            <strong className="al-actor">{log.userName || 'System'}</strong>
                            {' '}
                            <span className="al-verb">{s.action}</span>
                            {s.subject && <> <strong className="al-subject">{s.subject}</strong></>}
                            {s.qualifier && <span className="al-qualifier"> · {s.qualifier}</span>}
                            {s.delta && (
                              <span className="al-delta">
                                {' — '}
                                <span className="al-delta-from">{s.delta.from}</span>
                                {' → '}
                                <span className="al-delta-to">{s.delta.to}</span>
                              </span>
                            )}
                            {!s.delta && s.amount && <span className="al-amount"> {s.amount}</span>}
                          </span>

                          <span className="al-meta">
                            {log.targetType && (
                              <span className={`al-target-chip al-target-${log.targetType}`}>
                                {log.targetType}
                              </span>
                            )}
                            {targetLink && (
                              <Link
                                to={targetLink.url}
                                className="al-entity-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {targetLink.label} <ExternalLink size={12} aria-hidden="true" />
                              </Link>
                            )}
                            <span className="al-time" title={absoluteTime(log.timestamp)}>
                              {relativeTime(log.timestamp)}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="al-pagination">
        <span className="text-secondary">
          {total === 0
            ? 'No entries'
            : `${rangeStart}–${rangeEnd} of ${total.toLocaleString()} · page ${page + 1} of ${totalPages}`}
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

      {/* Details drawer */}
      {selected && (
        <LogDrawer
          log={selected}
          onClose={closeDrawer}
          showRaw={showRaw}
          onToggleRaw={() => setShowRaw((v) => !v)}
          drawerRef={drawerRef}
        />
      )}
    </div>
  );
};

// ── Details drawer ───────────────────────────────────────────────────────────

const LogDrawer = ({ log, onClose, showRaw, onToggleRaw, drawerRef }) => {
  const kind = getActionKind(log.action);
  const Icon = KIND_ICONS[kind] || Activity;
  const sentence = formatLogSentence(log);
  const changes = extractChanges(log.details);
  const context = extractContext(log.details);
  const hasDetails = log.details && Object.keys(log.details).length > 0;
  const targetLink = getTargetLink(log.targetType, log.targetId);

  return (
    <>
      <button className="al-drawer-scrim" onClick={onClose} aria-label="Close details" tabIndex={-1} />
      <aside
        className="al-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="al-drawer-title"
        ref={drawerRef}
        tabIndex={-1}
      >
        <header className="al-drawer-head">
          <div className="al-drawer-head-main">
            <span className={`al-kind al-kind-${kind}`}>
              <Icon size={15} aria-hidden="true" />
            </span>
            <h2 id="al-drawer-title" className="al-drawer-title">{log.action}</h2>
          </div>
          <button type="button" className="al-drawer-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </header>

        <div className="al-drawer-body">
          {/* Action Summary Card */}
          <div className="al-drawer-summary-card">
            <p className="al-drawer-summary-text">
              <strong className="al-actor">{log.userName || 'System'}</strong>
              {' '}
              <span className="al-verb">{sentence.action}</span>
              {sentence.subject && <> <strong className="al-subject">{sentence.subject}</strong></>}
              {sentence.qualifier && <span className="al-qualifier"> · {sentence.qualifier}</span>}
              {sentence.delta && (
                <span className="al-delta">
                  {' — '}
                  <span className="al-delta-from">{sentence.delta.from}</span>
                  {' → '}
                  <span className="al-delta-to">{sentence.delta.to}</span>
                </span>
              )}
              {!sentence.delta && sentence.amount && <span className="al-amount"> {sentence.amount}</span>}
            </p>
          </div>

          <dl className="al-kv">
            <div className="al-kv-row">
              <dt>Performed by</dt>
              <dd>{log.userName || 'System'}</dd>
            </div>
            <div className="al-kv-row">
              <dt>When</dt>
              <dd>{absoluteTime(log.timestamp)}</dd>
            </div>
            {log.targetType && (
              <div className="al-kv-row">
                <dt>Target type</dt>
                <dd>
                  <span className={`al-target-chip al-target-${log.targetType}`}>{log.targetType}</span>
                </dd>
              </div>
            )}
            {log.targetId && (
              <div className="al-kv-row">
                <dt>Target ID</dt>
                <dd className="al-target-id-container">
                  <code className="al-code">{log.targetId}</code>
                  {targetLink && (
                    <Link to={targetLink.url} className="al-drawer-target-link">
                      {targetLink.label} <ExternalLink size={12} aria-hidden="true" />
                    </Link>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {changes.length > 0 && (
            <section className="al-drawer-section">
              <h3 className="al-drawer-section-title">What changed</h3>
              <table className="al-diff">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field}>
                      <th scope="row">{c.field}</th>
                      <td><span className="al-diff-old">{c.from}</span></td>
                      <td><span className="al-diff-new">{c.to}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {context.length > 0 && (
            <section className="al-drawer-section">
              <h3 className="al-drawer-section-title">Item & Action Details</h3>
              <dl className="al-kv">
                {context.map((c) => (
                  <div className="al-kv-row" key={c.key}>
                    <dt>{c.key}</dt>
                    <dd>{c.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {!hasDetails && (
            <p className="text-secondary al-drawer-none">No extra details were recorded for this action.</p>
          )}

          {hasDetails && (
            <section className="al-drawer-section">
              <button type="button" className="al-raw-toggle" onClick={onToggleRaw} aria-expanded={showRaw}>
                {showRaw ? 'Hide' : 'View'} raw data
              </button>
              {showRaw && <pre className="al-raw">{JSON.stringify(log.details, null, 2)}</pre>}
            </section>
          )}
        </div>
      </aside>
    </>
  );
};

export default ActivityLog;
