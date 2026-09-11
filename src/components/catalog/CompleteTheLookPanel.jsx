import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link2, Lightbulb, X, ArrowUp, ArrowDown, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  listComplements,
  addComplement,
  updateComplement,
  removeComplement,
  promoteSuggestion,
  getStyledLookSuggestions,
} from '../../services/productComplementService';
import { getProducts } from '../../services/productService';
import ProductPickerModal from '../ProductPickerModal';
import ConfirmDialog from '../ConfirmDialog';

/**
 * "Complete the Look" (Phase 1): curated cross-sell links shown on the
 * mobile product page, plus staff-facing suggestions for products that
 * already share a styled look (pose_guide) with this one.
 *
 * Writes here are immediate (not staged with the rest of the product
 * form) -- each action is its own small, already-idempotent DB call
 * (see productComplementService.js), so there's nothing to lose by not
 * batching it into the form's Save button.
 */
const CompleteTheLookPanel = ({ productId, readOnly = false }) => {
  const [complements, setComplements] = useState([]);
  const [productsById, setProductsById] = useState(new Map());
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState(null);

  const refreshComplements = useCallback(async () => {
    const rows = await listComplements(productId);
    setComplements(rows);
  }, [productId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      listComplements(productId),
      getProducts(false),
      getStyledLookSuggestions(productId),
    ])
      .then(([complementRows, allProducts, suggestionRows]) => {
        if (!active) return;
        setComplements(complementRows);
        setProductsById(new Map(allProducts.map((p) => [p.docId, p])));
        setSuggestions(suggestionRows);
      })
      .catch((err) => {
        console.error('Failed to load Complete the Look data:', err);
        if (active) toast.error('Failed to load Complete the Look data.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  const linkedProductIds = useMemo(
    () => new Set(complements.map((c) => c.complementaryProductId)),
    [complements],
  );

  const handleAdd = async (targetProductId) => {
    try {
      await addComplement(productId, targetProductId, { origin: 'manual', sortOrder: complements.length });
      await refreshComplements();
      toast.success('Added to Complete the Look.');
    } catch (err) {
      console.error('Failed to add complement:', err);
      toast.error('Failed to add product.');
    }
  };

  const handleToggleActive = async (complement) => {
    try {
      await updateComplement(complement.id, { isActive: !complement.isActive });
      await refreshComplements();
    } catch (err) {
      console.error('Failed to update complement:', err);
      toast.error('Failed to update visibility.');
    }
  };

  const handleMove = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= complements.length) return;
    const a = complements[index];
    const b = complements[target];
    try {
      await Promise.all([
        updateComplement(a.id, { sortOrder: b.sortOrder }),
        updateComplement(b.id, { sortOrder: a.sortOrder }),
      ]);
      await refreshComplements();
    } catch (err) {
      console.error('Failed to reorder complements:', err);
      toast.error('Failed to reorder.');
    }
  };

  const handleRemove = async () => {
    if (!pendingRemoveId) return;
    try {
      await removeComplement(pendingRemoveId);
      await refreshComplements();
      toast.success('Removed.');
    } catch (err) {
      console.error('Failed to remove complement:', err);
      toast.error('Failed to remove product.');
    } finally {
      setPendingRemoveId(null);
    }
  };

  const handlePromote = async (suggestion) => {
    try {
      await promoteSuggestion(productId, suggestion.id, { origin: 'styled_look_suggestion', sortOrder: complements.length });
      await refreshComplements();
      toast.success(`${suggestion.name} added to Complete the Look.`);
    } catch (err) {
      console.error('Failed to promote suggestion:', err);
      toast.error('Failed to add suggestion.');
    }
  };

  const sortedComplements = useMemo(
    () => [...complements].sort((a, b) => a.sortOrder - b.sortOrder),
    [complements],
  );

  if (loading) {
    return (
      <section className="card p-6">
        <div className="text-sm text-secondary">Loading Complete the Look...</div>
      </section>
    );
  }

  return (
    <>
      {/* Curated Links */}
      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-secondary uppercase tracking-widest flex items-center gap-2">
            <Link2 size={14} /> Complete the Look — Curated Links
          </h2>
          {!readOnly && (
            <button type="button" onClick={() => setPickerOpen(true)} className="btn-outline small flex items-center gap-1">
              <Plus size={14} /> Add Product
            </button>
          )}
        </div>
        <p className="text-xs text-secondary mb-4">
          Products shown to customers under &quot;Complete the Look&quot; on this item&apos;s mobile page. Inactive links are hidden from customers but kept for reference.
        </p>

        {sortedComplements.length === 0 ? (
          <div className="text-center py-6 text-sm text-secondary">No curated links yet.</div>
        ) : (
          <div className="space-y-2">
            {sortedComplements.map((c, idx) => {
              const product = productsById.get(c.complementaryProductId);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{ borderColor: 'var(--border-color)', opacity: c.isActive ? 1 : 0.5 }}
                >
                  <div className="flex flex-col">
                    <button type="button" disabled={readOnly || idx === 0} onClick={() => handleMove(idx, -1)} className="gallery-btn disabled:opacity-30" title="Move up">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" disabled={readOnly || idx === sortedComplements.length - 1} onClick={() => handleMove(idx, 1)} className="gallery-btn disabled:opacity-30" title="Move down">
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <div className="avatar bg-light text-primary flex-center text-lg" style={{ width: 40, height: 40, flexShrink: 0 }}>
                    {product?.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : '👗'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{product?.name || 'Unknown product'}</div>
                    <div className="text-xs text-secondary flex items-center gap-2">
                      <span className="tag-badge">{c.origin}</span>
                      {!c.isActive && <span className="text-red-500 font-bold">Inactive</span>}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium">
                        <input type="checkbox" checked={c.isActive} onChange={() => handleToggleActive(c)} className="w-3.5 h-3.5 accent-primary" />
                        Active
                      </label>
                      <button type="button" onClick={() => setPendingRemoveId(c.id)} className="gallery-btn text-red-500" title="Remove">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Smart Suggestions */}
      <section className="card p-6">
        <h2 className="text-xs font-bold text-secondary uppercase tracking-widest mb-2 flex items-center gap-2">
          <Lightbulb size={14} /> Smart Suggestions
        </h2>
        <p className="text-xs text-secondary mb-4">
          Products that already appear in a styled look with this item. Promote one to add it as a curated link above.
        </p>

        {suggestions.length === 0 ? (
          <div className="text-center py-6 text-sm text-secondary">No styled-look suggestions for this product yet.</div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((s) => {
              const alreadyLinked = linkedProductIds.has(s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="avatar bg-light text-primary flex-center text-lg" style={{ width: 40, height: 40, flexShrink: 0 }}>
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    ) : '👗'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-secondary">Shared in {s.sharedLookCount} styled look{s.sharedLookCount === 1 ? '' : 's'}</div>
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={alreadyLinked}
                      onClick={() => handlePromote(s)}
                      className="btn-outline small flex items-center gap-1 disabled:opacity-50"
                    >
                      <Sparkles size={12} /> {alreadyLinked ? 'Added' : 'Add suggested'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ProductPickerModal
        isOpen={pickerOpen}
        title="Add to Complete the Look"
        selectedIds={[]}
        excludeIds={[productId, ...linkedProductIds]}
        onToggle={handleAdd}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        isOpen={Boolean(pendingRemoveId)}
        title="Remove Curated Link"
        message="Remove this product from Complete the Look? This cannot be undone -- to hide it instead, turn off Active."
        confirmText="Remove"
        onConfirm={handleRemove}
        onCancel={() => setPendingRemoveId(null)}
      />
    </>
  );
};

export default CompleteTheLookPanel;
