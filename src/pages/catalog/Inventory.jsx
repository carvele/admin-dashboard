import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Download,
  PackageOpen,
  Package,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  RefreshCw,
  ShoppingCart,
  Info,
  Flame,
  ChevronDown,
  ChevronRight,
  Settings2,
} from 'lucide-react';
import { getStockHealth, getStockPriority, isStockAlert, getStockBreakdown } from '../../utils/stockStatus';
import {
  subscribeToInventory,
  subscribeToProducts,
  updateInventoryItem,
  adjustInventoryStockDelta,
  archiveInventoryItem,
  restoreInventoryItem,
  getInventory,
  getProducts,
  updateProduct,
  recalculateAllInventoryStock,
  recordBoutiqueSale,
  subscribeToCategories,
  persistDemandScore,
  logStockMovement,
} from '../../services/productService';
import { getWaitlistDemand } from '../../services/stockNotifyService';
import { logAction } from '../../services/staffService';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { downloadCSV } from '../../utils/reportExporter';
import AdminInventoryPanel from '../../components/inventory/AdminInventoryPanel';
import StockStatusBadge from '../../components/inventory/StockStatusBadge';
import PageHeader from '../../components/PageHeader';
import SkeletonTable from '../../components/SkeletonTable';
import ConfirmDialog from '../../components/ConfirmDialog';
import { toast } from 'sonner';
import './Inventory.css';

// Garment sizes don't sort alphabetically in a useful order (S, M, L, XL — not
// L, M, S, XL). Anything not in this list (numeric sizes, "One Size", etc.)
// sorts after the named sizes, alphabetically among themselves.
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const sizeRank = (s) => {
  const i = SIZE_ORDER.indexOf(s);
  return i === -1 ? SIZE_ORDER.length : i;
};

const TABLE_COLUMNS = 10;

// Helper to group flat inventory rows by (productDocId || item, size)
const groupInventoryRows = (rows) => {
  const map = new Map();
  rows.forEach((r) => {
    const key = `${r.productDocId || r.item}|||${r.size}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        productDocId: r.productDocId,
        sku: r.sku,
        variantSku: r.variantSku || r.sku,
        item: r.item,
        category: r.category,
        size: r.size,
        deleted: r.deleted,
        variants: [],
      });
    }
    map.get(key).variants.push(r);
  });
  return Array.from(map.values()).sort(
    (a, b) => a.item.localeCompare(b.item) || sizeRank(a.size) - sizeRank(b.size)
  );
};

const GroupedInvRow = ({
  group,
  isAdminUnlocked,
  handleRestore,
  handlePublishProduct,
  setRestockModal,
  setRestockQty,
  setSellModal,
  setSalePriceInput,
  setArchiveConfirm,
}) => {
  const [selectedColor, setSelectedColor] = useState('ALL');

  const activeVariant = useMemo(() => {
    if (selectedColor === 'ALL') return null;
    return group.variants.find((v) => (v.color || 'Standard') === selectedColor) || null;
  }, [group.variants, selectedColor]);

  const displayedTotal = useMemo(() => {
    if (activeVariant) return activeVariant.total;
    return group.variants.reduce((sum, v) => sum + (v.total || 0), 0);
  }, [group.variants, activeVariant]);

  const displayedReserved = useMemo(() => {
    if (activeVariant) return activeVariant.reserved || 0;
    return group.variants.reduce((sum, v) => sum + (v.reserved || 0), 0);
  }, [group.variants, activeVariant]);

  const displayedAvailable = useMemo(() => {
    if (activeVariant) return activeVariant.available || 0;
    return group.variants.reduce((sum, v) => sum + (v.available || 0), 0);
  }, [group.variants, activeVariant]);

  const health = getStockHealth(displayedAvailable, displayedTotal, displayedReserved);
  const targetInv = activeVariant || group.variants[0] || group;
  const skuDisplay =
    activeVariant?.variantSku ||
    activeVariant?.variant_sku ||
    targetInv.variantSku ||
    targetInv.variant_sku ||
    targetInv.sku ||
    targetInv.id;

  return (
    <tr key={group.key}>
      <td className="font-mono text-xs text-secondary">{skuDisplay}</td>
      <td className="font-medium">{group.item}</td>
      <td>{group.category}</td>
      <td>
        <span className="size-badge">{group.size}</span>
      </td>
      <td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
          {group.variants.length > 1 && (
            <button
              type="button"
              className={`color-chip-btn ${selectedColor === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedColor('ALL')}
            >
              All ({group.variants.reduce((s, v) => s + (v.available || 0), 0)})
            </button>
          )}
          {group.variants.map((v) => {
            const cName = v.color || 'Standard';
            const isSel = selectedColor === cName;
            return (
              <button
                key={v.id || cName}
                type="button"
                className={`color-chip-btn ${isSel ? 'active' : ''}`}
                onClick={() => setSelectedColor(cName)}
              >
                {cName} ({v.available || 0})
              </button>
            );
          })}
        </div>
      </td>
      <td className="text-right">{displayedTotal}</td>
      <td className="text-right text-secondary">{displayedReserved}</td>
      <td className="text-right font-medium">{displayedAvailable}</td>
      <td className="stock-cell">
        <div className="urgency-tooltip-wrap">
          <div className="stock-progress-container" style={{ flex: 1 }}>
            <div className="stock-progress-bar">
              <div
                className="stock-progress-fill"
                style={{ width: `${health.percent}%`, backgroundColor: health.color }}
              />
            </div>
            <StockStatusBadge
              available={displayedAvailable}
              total={displayedTotal}
              reserved={displayedReserved}
            />
            {(health.demandLevel === 'moderate' || health.demandLevel === 'high') && (
              <span className={`demand-badge ${health.demandLevel}`}>
                🔥 {health.demandLevel === 'high' ? 'High' : 'Mod.'} Demand
              </span>
            )}
          </div>
          <Info size={13} style={{ color: health.color, flexShrink: 0, opacity: 0.75 }} />
          <span className="urgency-tip">{health.urgencyTooltip}</span>
        </div>
      </td>
      <td className="text-right">
        <div className="action-buttons justify-end">
          {targetInv.deleted ? (
            <button
              className="icon-btn-small text-success"
              title="Restore"
              onClick={() => handleRestore(targetInv)}
            >
              <ArchiveRestore size={15} />
            </button>
          ) : (
            <>
              <button
                className="icon-btn-small"
                title="Add / Publish"
                onClick={() => handlePublishProduct(targetInv)}
                style={{ opacity: displayedAvailable > 0 ? 1 : 0.4 }}
              >
                <Plus size={15} />
              </button>
              <button
                className="icon-btn-small restock-btn"
                title="Restock"
                onClick={() => {
                  setRestockModal(targetInv);
                  setRestockQty('');
                }}
              >
                <Package size={15} />
              </button>
              <button
                className="icon-btn-small"
                title="Record Boutique Sale"
                onClick={() => {
                  setSellModal(targetInv);
                  setRestockQty('1');
                  setSalePriceInput(targetInv.price || '');
                }}
                style={{ color: 'var(--stock-high)', opacity: displayedAvailable > 0 ? 1 : 0.4 }}
                disabled={displayedAvailable <= 0}
              >
                <ShoppingCart size={15} />
              </button>
              {isAdminUnlocked && (
                <button
                  className="icon-btn-small text-warning"
                  title="Archive"
                  onClick={() => setArchiveConfirm(targetInv)}
                >
                  <Archive size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

const Inventory = () => {
  const { user, isAdminUnlocked } = useAuth();
  const canManageLookups = can(user?.role, 'manage_inventory');
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('inventory');
  const [waitlistDemand, setWaitlistDemand] = useState([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);

  React.useEffect(() => {
    const unsub = subscribeToInventory((data) => {
      setInventory(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (activeTab === 'waitlist' && waitlistDemand.length === 0) {
      setLoadingWaitlist(true);
      getWaitlistDemand()
        .then(data => {
          setWaitlistDemand(data);
          setLoadingWaitlist(false);
        })
        .catch(err => {
          console.error(err);
          setLoadingWaitlist(false);
        });
    }
  }, [activeTab, waitlistDemand.length]);

  // Product list — needed to map each inventory row to its category/subcategory
  // (category_id lives on products, not on inventory rows) and to feed the
  // stock-baseline picker in the admin panel below. includeDeleted=true so
  // archived inventory rows (viewMode === 'archived') still resolve their
  // real category instead of falling into "Uncategorized" just because
  // their parent product is soft-deleted.
  React.useEffect(() => {
    const unsub = subscribeToProducts((data) => setProducts(data), true);
    return () => unsub();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [colorFilter, setColorFilter] = useState('All');
  const [categoryTree, setCategoryTree] = useState([]); // [{id,name,subcategories:[{id,name}]}]
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: 'stockStatus', direction: 'ascending' });
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archived'

  // Extract unique colors for filter
  const uniqueColors = useMemo(() => {
    const set = new Set();
    inventory.forEach((item) => {
      if (item.color) set.add(item.color);
    });
    return ['All', ...Array.from(set).sort()];
  }, [inventory]);

  // Subscribe to the real category tree for both the filter dropdown and the
  // Category → Subcategory grouping below.
  React.useEffect(() => {
    const unsub = subscribeToCategories((tree) => setCategoryTree(tree));
    return () => unsub();
  }, []);

  // Modals
  const [restockModal, setRestockModal] = useState(null); // inv item or null
  const [sellModal, setSellModal] = useState(null); // Added for POS
  const [archiveConfirm, setArchiveConfirm] = useState(null);

  // Form state
  const [restockQty, setRestockQty] = useState('');
  const [salePriceInput, setSalePriceInput] = useState('');

  // ── Demand score persistence (fire-and-forget, debounced per item) ──────────
  // Runs whenever inventory changes. Writes demandScore + tier to Firestore
  // for historical analysis. Skips if the stored value already matches.
  const persistTimerRef = useRef(null);
  useEffect(() => {
    if (inventory.length === 0) return;
    // Debounce: wait 2s after last inventory update before writing
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      inventory.forEach((item) => {
        if (!item.docId) return;
        const health = getStockHealth(item.available, item.total, item.reserved || 0);
        // Only write if the stored value is stale or missing
        if (
          item.demandScore !== health.demandScore ||
          item.stockTier  !== health.tier
        ) {
          persistDemandScore(
            item.docId,
            health.demandScore,
            health.tier,
            health.adjustedScore
          );
        }
      });
    }, 2000);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [inventory]);

  // Derived stats (Active inventory only)
  const activeInventory = inventory.filter((i) => i.deleted !== true);
  const totalItems = activeInventory.length;
  const totalStock = activeInventory.reduce((sum, i) => sum + i.total, 0);
  const totalReserved = activeInventory.reduce((sum, i) => sum + i.reserved, 0);

  // 5-tier breakdown — used for stat card + sorting
  const stockBreakdown = getStockBreakdown(
    activeInventory.map((i) => ({ available: i.available, total: i.total, reserved: i.reserved || 0 }))
  );
  const lowStockCount = stockBreakdown.alerts; // very-low + critical + no-stock

  // Detect active catalog products that have NO inventory rows at all.
  // These are data-integrity gaps: the catalog shows them as a product but
  // there is nothing to restock, sell, or track against.
  const inventoryProductIds = useMemo(() => {
    const ids = new Set();
    inventory.forEach((r) => { if (r.productDocId) ids.add(r.productDocId); });
    return ids;
  }, [inventory]);

  const productsWithNoInventory = useMemo(() =>
    products.filter(
      (p) => !p.deleted && !inventoryProductIds.has(p.id)
    ),
    [products, inventoryProductIds]
  );

  // Extract unique categories for filter - Sync with DB categories
  const dropdownCategories = ['All', ...categoryTree.map((c) => c.name)];

  const [noInvBannerDismissed, setNoInvBannerDismissed] = useState(false);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Sorting uses the shared getStockPriority from the stockStatus utility
  // (demand-aware priority: 1 = worst, 5 = best)

  const sortedInv = [...inventory].sort((a, b) => {
    if (sortConfig.key === 'stockStatus') {
      const priorityA = getStockPriority(a.available, a.total, a.reserved || 0);
      const priorityB = getStockPriority(b.available, b.total, b.reserved || 0);
      if (priorityA !== priorityB) {
        return sortConfig.direction === 'ascending' ? priorityA - priorityB : priorityB - priorityA;
      }
      return (a.item || '').localeCompare(b.item || '');
    }

    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'ascending' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'ascending' ? 1 : -1;
    }
    return 0;
  });

  const filteredInv = sortedInv.filter((item) => {
    // Filter by view mode (active vs archived)
    const isArchived = item.deleted === true;
    if (viewMode === 'active' && isArchived) return false;
    if (viewMode === 'archived' && !isArchived) return false;

    const term = (searchTerm || '').toLowerCase();
    const matchesSearch =
      (item.item || '').toLowerCase().includes(term) ||
      (item.sku || '').toLowerCase().includes(term) ||
      (item.variantSku || item.variant_sku || '').toLowerCase().includes(term) ||
      (item.color || '').toLowerCase().includes(term) ||
      (item.id || '').toLowerCase().includes(term);

    const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
    const matchesColor = colorFilter === 'All' || (item.color || '') === colorFilter;

    return matchesSearch && matchesCategory && matchesColor;
  });

  // ── Category → Subcategory grouping (the "browsing" view) ──────────────────
  // Only used when search, category, and color filters are default.
  const isBrowsingMode =
    !searchTerm.trim() &&
    categoryFilter === 'All' &&
    colorFilter === 'All';

  const productMetaById = useMemo(() => {
    const map = {};
    products.forEach((p) => { map[p.id] = p; });
    return map;
  }, [products]);

  const hierarchy = useMemo(() => {
    if (!isBrowsingMode) return [];
    const scopedRows = inventory.filter((i) => (i.deleted === true) === (viewMode === 'archived'));

    return categoryTree
      .map((cat) => {
        const subcats = cat.subcategories
          .map((sub) => {
            const rows = scopedRows
              .filter((r) => productMetaById[r.productDocId]?.categoryId === sub.id)
              .sort((a, b) => a.item.localeCompare(b.item) || sizeRank(a.size) - sizeRank(b.size));
            return {
              ...sub,
              rows,
              alertCount: rows.filter((r) => isStockAlert(r.available, r.total, r.reserved || 0)).length,
            };
          })
          .filter((sub) => sub.rows.length > 0);

        return {
          ...cat,
          subcats,
          rowCount: subcats.reduce((s, sc) => s + sc.rows.length, 0),
          alertCount: subcats.reduce((s, sc) => s + sc.alertCount, 0),
        };
      })
      .filter((cat) => cat.subcats.length > 0);
  }, [isBrowsingMode, inventory, viewMode, productMetaById, categoryTree]);

  const uncategorizedRows = useMemo(() => {
    if (!isBrowsingMode) return [];
    const scopedRows = inventory.filter((i) => (i.deleted === true) === (viewMode === 'archived'));
    return scopedRows
      .filter((r) => !productMetaById[r.productDocId]?.categoryId)
      .sort((a, b) => a.item.localeCompare(b.item) || sizeRank(a.size) - sizeRank(b.size));
  }, [isBrowsingMode, inventory, viewMode, productMetaById]);

  const toggleCategory = useCallback((id) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // getStockStatus is replaced by the shared getStockHealth() from stockStatus.js

  // --- ACTIONS ---
  const syncProductStock = async (productDocId, sku) => {
    try {
      const currentInventory = await getInventory();
      const allSizes = currentInventory.filter(
        (i) => (i.productDocId || i.sku) === (productDocId || sku),
      );

      let newTotalStock = 0; // Total Available
      let totalReserved = 0;
      let actualProdDocId = productDocId;

      allSizes.forEach((s) => {
        newTotalStock += s.available || 0;
        totalReserved += s.reserved || 0;
        if (!actualProdDocId && s.productDocId) actualProdDocId = s.productDocId;
      });

      if (!actualProdDocId) {
        const prods = await getProducts();
        const match = prods.find((p) => p.id === sku); // item.id is sku
        if (match) actualProdDocId = match.docId;
      }

      if (actualProdDocId) {
        let status = 'In Boutique';
        if (newTotalStock <= 0) {
          status = totalReserved > 0 ? 'Reserved' : 'Out of Stock';
        }

        await updateProduct(actualProdDocId, {
          stock: newTotalStock,
          status: status
        });
      }
    } catch (err) {
      console.error('Failed to sync total stock to product:', err);
    }
  };

  const handleRestock = async (e) => {
    e.preventDefault();
    const qty = parseInt(restockQty);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }

    try {
      // Delta applied atomically server-side, not restockModal.total + qty --
      // restockModal is a snapshot from whenever this modal opened, so two
      // restocks landing close together (a double-click, two staff acting
      // near-simultaneously) used to both add qty to the same stale starting
      // number, silently losing one restock's units.
      const result = await adjustInventoryStockDelta(restockModal.docId, {
        totalDelta: qty,
        availableDelta: qty,
      });
      await syncProductStock(restockModal.productDocId, restockModal.sku);
      await logStockMovement(
        restockModal.productDocId,
        result?.prevTotal ?? restockModal.total,
        result?.newTotal ?? restockModal.total + qty,
        'restock',
        `Restock: +${qty} units of ${restockModal.item} (size ${restockModal.size})`,
      );
      await logAction(user, 'Restocked inventory item', {
        targetType: 'product',
        targetId: restockModal.productDocId,
        itemName: restockModal.item,
        size: restockModal.size,
        color: restockModal.color || restockModal.colour || '',
        qtyAdded: qty,
        // Before/after come from the atomic RPC's own return values, so the
        // activity log shows the true stock movement rather than a number
        // derived from a possibly-stale modal snapshot.
        qtyBefore: result?.prevTotal ?? restockModal.total,
        qtyAfter: result?.newTotal ?? restockModal.total + qty,
      });
      toast.success(`Restocked ${restockModal.item} (${restockModal.size}) +${qty} units`);
      setRestockModal(null);
      setRestockQty('');
    } catch {
      toast.error('Failed to restock items');
    }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    const qty = parseInt(restockQty);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    if (qty > sellModal.available) {
      toast.error('Cannot sell more than available stock');
      return;
    }

    const toastId = toast.loading('Recording in-store sale...');
    try {
      const price = parseFloat(salePriceInput) || 0;
      await recordBoutiqueSale(sellModal, qty, user, price);
      await syncProductStock(sellModal.productDocId, sellModal.sku);

      toast.success(`Recorded sale: ${sellModal.item} x${qty}`, { id: toastId });
      setSellModal(null);
      setRestockQty('');
      setSalePriceInput('');
    } catch (e) {
      toast.error('Failed to record sale: ' + e.message, { id: toastId });
    }
  };


  const handleArchive = async () => {
    const item = archiveConfirm;
    try {
      await archiveInventoryItem(item.docId);
      await syncProductStock(item.productDocId, item.sku);
      await logStockMovement(
        item.productDocId,
        item.total,
        0,
        'correction',
        `Archived inventory row: ${item.item} (size ${item.size}), ${item.total} units removed from circulation`,
      );
      await logAction(user, 'Archived inventory item', {
        targetType: 'product',
        targetId: item.productDocId,
        itemName: item.item,
        size: item.size,
      });
      toast.success(`Archived ${item.item} (${item.size}) from inventory`);
    } catch {
      toast.error('Failed to archive item');
    } finally {
      setArchiveConfirm(null);
    }
  };

  const handleRestore = async (item) => {
    try {
      await restoreInventoryItem(item.docId);
      await syncProductStock(item.productDocId, item.sku);
      await logStockMovement(
        item.productDocId,
        0,
        item.total,
        'correction',
        `Restored inventory row: ${item.item} (size ${item.size}), ${item.total} units returned to circulation`,
      );
      await logAction(user, 'Restored inventory item', {
        targetType: 'product',
        targetId: item.productDocId,
        itemName: item.item,
        size: item.size,
      });
      toast.success(`Restored ${item.item} (${item.size}) to active inventory`);
    } catch {
      toast.error('Failed to restore item');
    }
  };

  const handleSyncStock = async () => {
    setIsSyncing(true);
    const toastId = toast.loading('Synchronizing inventory with reservations...');
    try {
      await recalculateAllInventoryStock();
      await logAction(user, 'Manually triggered Inventory Sync');
      toast.success('Inventory re-calculated and synchronized successfully!', { id: toastId });
    } catch (err) {
      console.error('Manual sync failed:', err);
      toast.error('Failed to synchronize inventory.', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePublishProduct = async (inv) => {
    if (inv.available <= 0) {
      toast.error('Cannot add to end user app without available stock');
      return;
    }
    try {
      let productDocId = inv.productDocId;
      if (!productDocId) {
        const prods = await getProducts();
        const match = prods.find((p) => p.id === inv.sku);
        if (match) productDocId = match.docId;
      }
      if (!productDocId) {
        toast.error('Product not found or unlinked');
        return;
      }
      await updateProduct(productDocId, { visibility: 'public' });
      await logAction(user, 'Added product to user app', {
        itemName: inv.item,
        sku: inv.sku
      });
      toast.success(`Product ${inv.item} has been added/published`);
    } catch {
      toast.error('Failed to add product to app');
    }
  };


  const csvField = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const handleExportCSV = () => {
    // Exports filteredInv, not the raw inventory list, so the file matches
    // whatever search/category/active-archived view the staff member is
    // currently looking at rather than silently dumping everything.
    const header = ['SKU/Variant', 'Product', 'Category', 'Size', 'Color', 'Pattern', 'Total', 'Reserved', 'Available'].join(',');
    const rows = filteredInv.map((i) =>
      [
        csvField(i.variantSku || i.variant_sku || i.sku || i.id),
        csvField(i.item),
        csvField(i.category),
        csvField(i.size),
        csvField(i.color || 'Standard'),
        csvField(i.pattern || 'Solid'),
        i.total,
        i.reserved || 0,
        i.available
      ].join(','),
    );
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`JezSy_Inventory_${viewMode}_${timestamp}.csv`, [header, ...rows].join('\n'));
    toast.success('Inventory exported as CSV');
  };

  const renderGroupedInvRow = (group) => {
    return (
      <GroupedInvRow
        key={group.key}
        group={group}
        isAdminUnlocked={isAdminUnlocked}
        handleRestore={handleRestore}
        handlePublishProduct={handlePublishProduct}
        setRestockModal={setRestockModal}
        setRestockQty={setRestockQty}
        setSellModal={setSellModal}
        setSalePriceInput={setSalePriceInput}
        setArchiveConfirm={setArchiveConfirm}
      />
    );
  };

  const renderGroupHeaderRow = (key, label, rowCount, alertCount, isExpanded, onClick, depth) => (
    <tr
      key={key}
      className={`inv-group-header depth-${depth}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      aria-expanded={isExpanded}
    >
      <td colSpan={TABLE_COLUMNS}>
        <div className="inv-group-header-content">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="inv-group-label">{label}</span>
          <span className="inv-group-count">{rowCount} {rowCount === 1 ? 'item' : 'items'}</span>
          {alertCount > 0 && (
            <span className="inv-group-alert">
              <AlertTriangle size={12} /> {alertCount} need{alertCount === 1 ? 's' : ''} attention
            </span>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Inventory Management"
        subtitle="Track stock levels and quantities per size across all products"
        category="OPERATIONS"
        actions={
          <div className="flex-center gap-2">
            {canManageLookups && (
              <button
                className={`btn-outline flex-center gap-2 ${showAdmin ? 'active' : ''}`}
                onClick={() => setShowAdmin(!showAdmin)}
                aria-label={showAdmin ? 'Hide admin controls' : 'Show admin controls'}
              >
                <Settings2 size={18} /> {showAdmin ? 'Hide Admin' : 'Show Admin'}
              </button>
            )}
            <button
              className="btn-outline flex-center gap-2"
              onClick={handleSyncStock}
              disabled={isSyncing}
            >
              <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
              {isSyncing ? 'Syncing...' : 'Fix & Sync Stock'}
            </button>
            <button className="btn-outline flex-center gap-2" onClick={handleExportCSV}>
              <Download size={18} /> Export CSV
            </button>
          </div>
        }
      />

      {showAdmin && canManageLookups && (
        <AdminInventoryPanel
          products={products}
          onClose={() => setShowAdmin(false)}
          onProductUpdated={() => {}}
        />
      )}

      <div className="inv-summary-grid">
        <div className="card inv-stat-card">
          <div className="icon-bg-soft blue">
            <PackageOpen size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label">Total Unique Items</p>
            <h3>{totalItems}</h3>
          </div>
        </div>
        <div className="card inv-stat-card">
          <div className="icon-bg-soft green">
            <PackageOpen size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label">Total Stock Units</p>
            <h3>{totalStock.toLocaleString()}</h3>
          </div>
        </div>
        <div className="card inv-stat-card">
          <div className="icon-bg-soft orange">
            <PackageOpen size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label">Reserved Units</p>
            <h3>{totalReserved.toLocaleString()}</h3>
          </div>
        </div>
        <div className={`card inv-stat-card ${lowStockCount > 0 ? 'border-danger' : ''}`}>
          <div className="icon-bg-soft red">
            <AlertTriangle size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label text-danger font-medium">Stock Alerts</p>
            <h3 className="text-danger">{lowStockCount}</h3>
            {lowStockCount > 0 && (
              <div className="stock-breakdown-row">
                {stockBreakdown.noStock > 0 && (
                  <span className="stock-breakdown-chip" style={{ background: 'var(--stock-none-bg)', color: 'var(--stock-none)' }}>
                    {stockBreakdown.noStock} No Stock
                  </span>
                )}
                {stockBreakdown.critical > 0 && (
                  <span className="stock-breakdown-chip" style={{ background: 'var(--stock-critical-bg)', color: 'var(--stock-critical)' }}>
                    {stockBreakdown.critical} Critical
                  </span>
                )}
                {stockBreakdown.veryLow > 0 && (
                  <span className="stock-breakdown-chip" style={{ background: 'var(--stock-very-low-bg)', color: 'var(--stock-very-low)' }}>
                    {stockBreakdown.veryLow} Very Low
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Products-with-no-inventory warning banner ── */}
      {!noInvBannerDismissed && productsWithNoInventory.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            background: 'var(--status-pending-bg, #fffbeb)',
            border: '1px solid var(--stock-very-low, #f59e0b)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            marginBottom: '0.75rem',
            fontSize: '0.85rem',
            color: 'var(--charcoal)',
          }}
        >
          <AlertTriangle size={18} style={{ color: 'var(--stock-very-low, #f59e0b)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <strong>Catalog products missing inventory rows ({productsWithNoInventory.length}):</strong>{' '}
            {productsWithNoInventory.map((p, i) => (
              <span key={p.id}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {i < productsWithNoInventory.length - 1 ? ', ' : ''}
              </span>
            ))}
            <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
              — Open each product in the Catalog and add size variants, or add rows directly through the Admin panel.
            </span>
          </div>
          <button
            onClick={() => setNoInvBannerDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: 'var(--text-secondary)', flexShrink: 0 }}
            aria-label="Dismiss warning"
          >
            &times;
          </button>
        </div>
      )}

      <div className="card mt-2">
        <div className="catalog-toolbar" style={{ borderBottom: '1px solid var(--border-color)', padding: '1rem' }}>
          <div className="catalog-toolbar-actions" style={{ width: '100%', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <div className="archive-toggle-tabs" style={{ display: 'flex', gap: '8px', marginRight: 'auto' }}>
              <button
                className={`archive-toggle-btn ${activeTab === 'inventory' ? 'active' : ''}`}
                onClick={() => setActiveTab('inventory')}
                style={{ margin: 0 }}
              >
                Inventory View
              </button>
              <button
                className={`archive-toggle-btn ${activeTab === 'waitlist' ? 'active' : ''}`}
                onClick={() => setActiveTab('waitlist')}
                style={{ margin: 0 }}
              >
                Customer Waitlist Demand
              </button>
            </div>

            {activeTab === 'inventory' && (
              <>
                <div className="search-box">
                  <Search size={18} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search Variant SKU, Name, Color..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-field pl-10"
                  />
                </div>
                <select
                  className="input-field category-filter"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filter by category"
                >
                  {dropdownCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'All' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
                {uniqueColors.length > 1 && (
                  <select
                    className="input-field category-filter"
                    value={colorFilter}
                    onChange={(e) => setColorFilter(e.target.value)}
                    aria-label="Filter by color"
                  >
                    {uniqueColors.map((col) => (
                      <option key={col} value={col}>
                        {col === 'All' ? 'All Colors' : col}
                      </option>
                    ))}
                  </select>
                )}
                {isAdminUnlocked && (
                  <div className="archive-toggle-tabs" style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className={`archive-toggle-btn ${viewMode === 'active' ? 'active' : ''}`}
                      onClick={() => setViewMode('active')}
                      style={{ margin: 0 }}
                    >
                      Active ({inventory.filter(i => i.deleted !== true).length})
                    </button>
                    <button
                      className={`archive-toggle-btn ${viewMode === 'archived' ? 'active' : ''}`}
                      onClick={() => setViewMode('archived')}
                      style={{ margin: 0 }}
                    >
                      <Archive size={14} /> Archived ({inventory.filter(i => i.deleted === true).length})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {activeTab === 'inventory' && isBrowsingMode && (
            <p className="inv-mode-hint text-secondary text-xs mt-3">
              Grouped by category — search or filter above to switch to a flat sortable list.
            </p>
          )}
        </div>

        {activeTab === 'waitlist' ? (
          <div className="table-container p-4">
            {loadingWaitlist ? (
              <SkeletonTable columns={3} rows={5} />
            ) : (
              <table className="table inv-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Size</th>
                    <th className="text-right">Customers Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistDemand.length === 0 ? (
                    <tr>
                      <td colSpan="3">
                        <div className="empty-state flex-col flex-center gap-3 p-8">
                          <p className="text-secondary">No active waitlist requests found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    waitlistDemand.map((req, idx) => (
                      <tr key={idx}>
                        <td className="font-medium">{req.productName}</td>
                        <td><span className="size-badge">{req.size}</span></td>
                        <td className="text-right font-bold text-danger">{req.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <>
        {loading ? (
          <div className="p-4"><SkeletonTable columns={TABLE_COLUMNS} rows={6} /></div>
        ) : (
          <div className="table-container">
            <table className="table inv-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('sku')} style={{ cursor: 'pointer' }}>
                    Variant SKU {sortConfig.key === 'sku' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('item')} style={{ cursor: 'pointer' }}>
                    Product Name {sortConfig.key === 'item' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>
                    Category {sortConfig.key === 'category' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                  </th>
                  <th>Size</th>
                  <th>Color</th>
                  <th className="text-right" onClick={() => handleSort('total')} style={{ cursor: 'pointer' }}>
                    Total {sortConfig.key === 'total' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                  </th>
                  <th className="text-right">Reserved</th>
                  <th className="text-right" onClick={() => handleSort('available')} style={{ cursor: 'pointer' }}>
                    Available {sortConfig.key === 'available' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('stockStatus')} style={{ cursor: 'pointer' }}>
                    Stock Level {sortConfig.key === 'stockStatus' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                  </th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isBrowsingMode ? (
                  hierarchy.length === 0 && uncategorizedRows.length === 0 ? (
                    <tr>
                      <td colSpan={TABLE_COLUMNS}>
                        <div className="empty-state flex-col flex-center gap-3 p-8">
                          <div className="icon-bg-large bg-light text-secondary mb-2 rounded-full p-4">
                            <PackageOpen size={48} opacity={0.5} />
                          </div>
                          <h3 className="text-lg font-medium">
                            No {viewMode === 'archived' ? 'archived' : ''} inventory yet
                          </h3>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {hierarchy.map((cat) => {
                        const catExpanded = expandedCategories.has(cat.id);
                        return (
                          <React.Fragment key={cat.id}>
                            {renderGroupHeaderRow(
                              cat.id,
                              cat.name,
                              cat.rowCount,
                              cat.alertCount,
                              catExpanded,
                              () => toggleCategory(cat.id),
                              0,
                            )}
                            {catExpanded && cat.subcats.map((sub) => {
                              const groupedRows = groupInventoryRows(sub.rows);
                              return (
                                <React.Fragment key={sub.id}>
                                  {renderGroupHeaderRow(
                                    sub.id,
                                    sub.name,
                                    groupedRows.length,
                                    sub.alertCount,
                                    expandedCategories.has(sub.id),
                                    () => toggleCategory(sub.id),
                                    1,
                                  )}
                                  {expandedCategories.has(sub.id) && groupedRows.map(renderGroupedInvRow)}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                      {uncategorizedRows.length > 0 && (
                        <React.Fragment>
                          {renderGroupHeaderRow(
                            'uncategorized',
                            'Uncategorized',
                            groupInventoryRows(uncategorizedRows).length,
                            uncategorizedRows.filter((r) => isStockAlert(r.available, r.total, r.reserved || 0)).length,
                            expandedCategories.has('uncategorized'),
                            () => toggleCategory('uncategorized'),
                            0,
                          )}
                          {expandedCategories.has('uncategorized') && groupInventoryRows(uncategorizedRows).map(renderGroupedInvRow)}
                        </React.Fragment>
                      )}
                    </>
                  )
                ) : filteredInv.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COLUMNS}>
                      <div className="empty-state flex-col flex-center gap-3 p-8">
                        <div className="icon-bg-large bg-light text-secondary mb-2 rounded-full p-4">
                          <PackageOpen size={48} opacity={0.5} />
                        </div>
                        <h3 className="text-lg font-medium">No inventory items found</h3>
                        <p className="text-secondary text-center max-w-sm">
                          We couldn&apos;t find any inventory records matching your current search. Try
                          adjusting your filters.
                        </p>
                        {searchTerm && (
                          <button className="btn-outline mt-2" onClick={() => setSearchTerm('')}>
                            Clear Search
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  groupInventoryRows(filteredInv).map(renderGroupedInvRow)
                )}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}
      </div>

      {/* ===== RESTOCK MODAL ===== */}
      {restockModal && (
        <div className="modal-overlay" onClick={() => setRestockModal(null)} role="presentation">
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
            style={{ maxWidth: 480 }}
          >
            <div className="modal-header">
              <h2>Restock Variant</h2>
              <button className="close-btn" onClick={() => setRestockModal(null)}>
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleRestock}>
              <p className="text-secondary text-sm" style={{ marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                Adds units to this exact variant only — other sizes or colors of this product are unaffected.
              </p>
              <div className="restock-item-info" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <strong>{restockModal.item}</strong>
                <span className="size-badge">{restockModal.size}</span>
                {restockModal.color && <span className="color-badge">{restockModal.color}</span>}
              </div>
              <p className="text-secondary text-sm" style={{ marginTop: '0.5rem' }}>
                Current Stock: <strong>{restockModal.available}</strong> / {restockModal.total}
              </p>
              <div className="form-group">
                <label className="label" htmlFor="restock-qty">Quantity to Add</label>
                <input
                  id="restock-qty"
                  type="number"
                  className="input-field"
                  min="1"
                  placeholder="Enter quantity"
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  required
                  style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setRestockModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Confirm Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      <ConfirmDialog
        isOpen={!!archiveConfirm}
        title="Archive Item?"
        message={`Move ${archiveConfirm?.item} (${archiveConfirm?.size}${archiveConfirm?.color ? ` · ${archiveConfirm.color}` : ''}) to the archive? History and reservation metrics will be preserved. You can restore it anytime.`}
        confirmText="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveConfirm(null)}
      />

      {/* ===== SELL / POS MODAL ===== */}
      {sellModal && (
        <div className="modal-overlay" onClick={() => setSellModal(null)} role="presentation">
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
            style={{ maxWidth: 500 }}
          >
            <div className="modal-header">
              <div className="flex-center gap-2">
                <ShoppingCart size={20} className="text-secondary" />
                <h2>Record In-Store Sale</h2>
              </div>
              <button className="close-btn" onClick={() => setSellModal(null)}>
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleSell}>
              <p className="text-secondary text-sm" style={{ marginTop: '-0.5rem' }}>
                Records a walk-in sale and deducts it from available stock for this variant.
              </p>
              <div className="restock-item-info" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <strong>{sellModal.item}</strong>
                <span className="size-badge">{sellModal.size}</span>
                {sellModal.color && <span className="color-badge">{sellModal.color}</span>}
              </div>
              <div className="p-3 bg-light rounded-lg mt-2 mb-4">
                <div className="d-flex justify-between text-sm mb-1">
                  <span className="text-secondary">Available Stock:</span>
                  <span className="font-bold">{sellModal.available} units</span>
                </div>
                <div className="d-flex justify-between text-sm">
                  <span className="text-secondary">Expected Price:</span>
                  <span className="font-bold text-success">₱{sellModal.price?.toLocaleString() || '--'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label" htmlFor="sell-unit-price">Actual Unit Price (₱)</label>
                  <input
                    id="sell-unit-price"
                    type="number"
                    className="input-field"
                    placeholder="UnitPrice"
                    value={salePriceInput}
                    onChange={(e) => setSalePriceInput(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label" htmlFor="sell-qty">Quantity Sold</label>
                  <input
                    id="sell-qty"
                    type="number"
                    className="input-field"
                    min="1"
                    max={sellModal.available}
                    placeholder="Qty"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    required
                  />
                </div>
              </div>

              {restockQty && parseInt(restockQty) > 0 && (
                <div className="p-3 bg-emerald-50 rounded-lg mt-2 mb-4 border border-emerald-100">
                  <div className="d-flex justify-between text-base">
                    <span className="font-semibold text-emerald-900">Total Transaction:</span>
                    <span className="font-bold text-emerald-700">
                      ₱{((parseFloat(salePriceInput) || 0) * parseInt(restockQty || 0)).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-emerald-600 mt-1">
                    Remaining Stock: {sellModal.available - parseInt(restockQty)} units
                  </div>
                </div>
              )}

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setSellModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ backgroundColor: 'var(--stock-high)' }}>
                  Confirm Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
