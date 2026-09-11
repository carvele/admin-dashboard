import { useState, useMemo, useEffect } from 'react';
import { Search, Check } from 'lucide-react';
import { subscribeToProducts } from '../services/productService';

/**
 * Reusable searchable multi-select product picker.
 *
 * v1 filters client-side over subscribeToProducts -- fine for a catalog
 * this size (tens of products). If the catalog grows large enough for this
 * to matter, swap the filter below for a server-side search query; the
 * props/selection contract here doesn't need to change either way.
 */
const ProductPickerModal = ({ isOpen, title = 'Select Products', selectedIds, onToggle, onClose, excludeIds = [] }) => {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    const unsub = subscribeToProducts(setProducts);
    return unsub;
  }, [isOpen]);

  const filtered = useMemo(() => {
    const pool = excludeIds.length ? products.filter((p) => !excludeIds.includes(p.docId)) : products;
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
  }, [products, query, excludeIds]);

  if (!isOpen) return null;

  return (
    <div role="presentation" className="modal-overlay" onClick={onClose}>
      <div role="presentation" className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            <input
              autoComplete="off"
              type="text"
              className="input-field"
              style={{ paddingLeft: 32 }}
              placeholder="Search products by name or category..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table className="table">
              <tbody>
                {filtered.map((p) => {
                  const isSelected = selectedIds.includes(p.docId);
                  return (
                    <tr key={p.docId} style={{ cursor: 'pointer' }} onClick={() => onToggle(p.docId)}>
                      <td style={{ width: 32 }}>
                        <div className={`checkbox-indicator ${isSelected ? 'checked' : ''}`} style={{
                          width: 18, height: 18, borderRadius: 4, border: '1px solid var(--border-color)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isSelected ? 'var(--color-primary, #6366f1)' : 'transparent',
                        }}>
                          {isSelected && <Check size={12} color="white" />}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar bg-light text-primary flex-center text-lg">
                            {typeof p.imageUrl === 'string' && p.imageUrl.startsWith('http') ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              '👗'
                            )}
                          </div>
                          <span className="font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="text-secondary">{p.category}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="3" className="text-center p-8 text-secondary">No products match &quot;{query}&quot;</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <span className="text-secondary text-sm" style={{ marginRight: 'auto' }}>{selectedIds.length} selected</span>
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

export default ProductPickerModal;
