/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Download,
  PackageOpen,
  Package,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  RefreshCw,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  Settings2,
  Palette,
  Copy,
  Check,
  MoreHorizontal,
  Globe,
  Layers,
  List,
} from 'lucide-react';
import { getStockHealth, getStockPriority, isStockAlert, getStockBreakdown } from '../../utils/stockStatus';
import {
    subscribeToProducts,
  adjustInventoryOnHand,
  archiveInventoryItem,
  restoreInventoryItem,
  getInventory,
  getProducts,
  updateProduct,
  recalculateAllInventoryStock,
  recordBoutiqueSale,
  subscribeToCategories,
  } from '../../services/productService';
import { getPaginatedInventory } from "../../services/inventoryService";
import { supabase } from '../../lib/supabaseClient';
import { updateVariantHexColor } from '../../services/variantService';
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
import { compareSizes } from '../../utils/sizeOrder';
import { resolveVariantSku } from '../../utils/skuHelper';
import { COLOR_DOT_MAP, getChipColorDot } from '../../utils/constants';
import './Inventory.css';

const TABLE_COLUMNS = 9;

const REDUCTION_REASONS = [
  'Damaged / Defective Garment',
  'Physical Inventory Discrepancy (Audit Correction)',
  'Lost / Shrinkage',
  'Display / Marketing Sample Write-Off',
  'Customer Return Adjustment',
  'Other (specify below)',
];

/**
 * VariantInvRow: Single compact row per sellable inventory variant.
 * 1 row = 1 physical SKU, size, color, and stock count.
 * Zero dead space, uniform 48px min-height, unambiguous restock/sell targets.
 */
const VariantInvRow = ({
  item,
  isAdminUnlocked,
  handleRestore,
  handlePublishProduct,
  setRestockModal,
  setRestockQty,
  setAdjustMode,
  setAdjustReason,
  setOtherReasonText,
  setSellModal,
  setSalePriceInput,
  setSalePaymentMethod,
  setSaleIdempotencyKey,
  setArchiveConfirm,
  setArColorModal,
  canManageLookups,
  productMetaById,
  activeMenuId,
  setActiveMenuId,
}) => {
  const [copied, setCopied] = useState(false);
  const parentProduct = productMetaById?.[item.productDocId || item.product_doc_id];
  const skuDisplay = resolveVariantSku(item, parentProduct);

  const copySku = (e) => {
    e.stopPropagation();
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(skuDisplay);
    setCopied(true);
    toast.success(`Copied SKU: ${skuDisplay}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const isMenuOpen = activeMenuId === item.id;
  const isArchived = item.deleted === true;
  const available = item.available ?? 0;
  const total = item.total ?? 0;
  const reserved = item.reserved ?? 0;

  const colorName = item.color || 'Standard';
  const naturalColor = getChipColorDot(colorName);
  const hasArOverride = !!item.hexColor && item.hexColor.toLowerCase() !== naturalColor.toLowerCase();

  return (
    <tr className={`inv-row ${isArchived ? 'archived-row' : ''}`}>
      {/* 1. Variant SKU with 1-click copy */}
      <td className="sku-cell">
        <div className="sku-badge-wrap">
          <button
            type="button"
            className="sku-code"
            title={`Click to copy: ${skuDisplay}`}
            onClick={copySku}
          >
            {skuDisplay}
          </button>
          <button
            type="button"
            className="sku-copy-btn"
            title="Copy SKU"
            aria-label={`Copy SKU ${skuDisplay}`}
            onClick={copySku}
          >
            {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
          </button>
        </div>
      </td>

      {/* 2. Product Name and Category */}
      <td className="cell-product">
        <div className="product-identity-group">
          <span className="product-title" title={item.item}>
            {item.item}
          </span>
          <span className="product-category-sub" title={item.category}>
            {item.category || 'Uncategorized'}
          </span>
        </div>
      </td>

      {/* 3. Size */}
      <td className="cell-size text-center">
        <span className="size-badge">{item.size || '--'}</span>
      </td>

      {/* 4. Color Swatch and Name */}
      <td className="cell-color">
        <div
          className="color-indicator-wrap"
          title={hasArOverride ? `Fabric: ${colorName} (AR 3D Tint: ${item.hexColor})` : `Color: ${colorName}`}
        >
          <span
            className="color-swatch-dot"
            style={{ backgroundColor: naturalColor }}
          />
          <span className="color-name-label">{colorName}</span>
          {hasArOverride && (
            <span
              className="ar-tint-badge"
              title={`Custom 3D AR Tint: ${item.hexColor}`}
            >
              <span className="ar-tint-dot" style={{ backgroundColor: item.hexColor }} />
              AR
            </span>
          )}
        </div>
      </td>

      {/* 5. Total Stock */}
      <td className="text-right cell-num">{total}</td>

      {/* 6. Reserved Stock */}
      <td className={`text-right cell-num ${reserved > 0 ? 'text-reserved-active' : 'text-secondary'}`}>
        {reserved}
      </td>

      {/* 7. Available Stock */}
      <td className={`text-right cell-num font-semibold ${available <= 0 ? 'text-danger' : 'text-success'}`}>
        {available}
      </td>

      {/* 8. Stock Status */}
      <td className="stock-cell">
        <StockStatusBadge
          available={available}
          total={total}
          reserved={reserved}
        />
      </td>

      {/* 9. Actions */}
      <td className="cell-actions text-right">
        <div className="action-buttons justify-end">
          {isArchived ? (
            <button
              type="button"
              className="icon-btn-small text-success"
              title="Restore Variant"
              aria-label="Restore Variant"
              onClick={() => handleRestore(item)}
            >
              <ArchiveRestore size={16} />
            </button>
          ) : (
            <>
              {/* Primary Action 1: Restock exact variant */}
              <button
                type="button"
                className="icon-btn-small restock-btn"
                title="Restock this variant"
                aria-label={`Restock ${item.item} (${item.size}, ${colorName})`}
                onClick={() => {
                  setRestockModal(item);
                  setRestockQty('');
                }}
              >
                <PackagePlus size={16} />
              </button>

              {/* Primary Action 2: Record Boutique POS Sale */}
              <button
                type="button"
                className="icon-btn-small sell-btn"
                title={available > 0 ? "Record Boutique Sale" : "Out of stock - cannot sell"}
                aria-label={`Record Sale for ${item.item} (${item.size}, ${colorName})`}
                onClick={() => {
                  setSellModal(item);
                  setRestockQty('1');
                  setSalePriceInput(productMetaById[item.productDocId]?.price || '');
                  setSalePaymentMethod('cash');
                  setSaleIdempotencyKey(crypto.randomUUID());
                }}
                disabled={available <= 0}
                style={{ opacity: available > 0 ? 1 : 0.35 }}
              >
                <ShoppingCart size={16} />
              </button>

              {/* Secondary Actions Menu */}
              <div className="dropdown-action-wrap">
                <button
                  type="button"
                  className={`icon-btn-small more-menu-btn ${isMenuOpen ? 'active' : ''}`}
                  title="More actions"
                  aria-label="More actions"
                  aria-expanded={isMenuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveMenuId(isMenuOpen ? null : item.id);
                  }}
                >
                  <MoreHorizontal size={16} />
                </button>

                {isMenuOpen && (
                  <div
                    className="inv-action-popover"
                    role="menu"
                  >
                    <button
                      type="button"
                      className="inv-popover-item"
                      title="Reduce stock for damage, loss, or audit write-off"
                      onClick={() => {
                        setActiveMenuId(null);
                        if (setAdjustMode) setAdjustMode('remove');
                        if (setAdjustReason) setAdjustReason('Damaged / Defective Garment');
                        if (setOtherReasonText) setOtherReasonText('');
                        setRestockModal(item);
                        setRestockQty('');
                      }}
                    >
                      <PackageMinus size={14} />
                      <span>Reduce / Write-Off Stock</span>
                    </button>

                    {canManageLookups && (
                      <button
                        type="button"
                        className="inv-popover-item"
                        onClick={() => {
                          setActiveMenuId(null);
                          setArColorModal(item);
                        }}
                      >
                        <Palette size={14} />
                        <span>{item.hexColor ? `AR Color (${item.hexColor})` : 'Configure AR Color'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className="inv-popover-item"
                      title="Publish product to mobile app"
                      onClick={() => {
                        setActiveMenuId(null);
                        handlePublishProduct(item);
                      }}
                    >
                      <Globe size={14} />
                      <span>Publish to Mobile App</span>
                    </button>

                    {isAdminUnlocked && (
                      <button
                        type="button"
                        className="inv-popover-item text-danger"
                        onClick={() => {
                          setActiveMenuId(null);
                          setArchiveConfirm(item);
                        }}
                      >
                        <Archive size={14} />
                        <span>Archive Variant</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
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
  const tableCardRef = useRef(null);


    const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('inventory');
  const [waitlistDemand, setWaitlistDemand] = useState([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);

  // Active dropdown action popover ID
  const [activeMenuId, setActiveMenuId] = useState(null);

  useEffect(() => {
    const handleWindowClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);



  React.useEffect(() => {
    if (activeTab === 'waitlist' && waitlistDemand.length === 0) {
      setLoadingWaitlist(true);
      getWaitlistDemand()
        .then((data) => {
          setWaitlistDemand(data);
          setLoadingWaitlist(false);
        })
        .catch((err) => {
          console.error(err);
          setLoadingWaitlist(false);
        });
    }
  }, [activeTab, waitlistDemand.length]);

  React.useEffect(() => {
    const unsub = subscribeToProducts((data) => {
      setProducts(data);
      setLoadingProducts(false);
    }, true);
    return () => unsub();
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('category') || 'All');
  const [colorFilter, setColorFilter] = useState(() => searchParams.get('color') || 'All');
  const [stockQuickFilter, setStockQuickFilter] = useState('all'); // 'all' | 'alerts' | 'reserved'
  const [viewGrouping, setViewGrouping] = useState('flat'); // 'flat' | 'grouped'
  const [categoryTree, setCategoryTree] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'item', direction: 'ascending' });
  const [viewMode, setViewMode] = useState(() => searchParams.get('view') || 'active'); // 'active' | 'archived'
  const [page, setPage] = useState(() => parseInt(searchParams.get('page') || '0', 10) || 0);
  const [selectedStatCard, setSelectedStatCard] = useState('variants'); // 'variants' | 'units' | 'reserved' | 'alerts'

  const handleCardClick = useCallback((cardType, filter) => {
    setSelectedStatCard(cardType);
    setStockQuickFilter(filter);
    setActiveTab('inventory');
    setPage(0);
    setTimeout(() => tableCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set('search', searchTerm.trim());
    if (categoryFilter && categoryFilter !== 'All') params.set('category', categoryFilter);
    if (colorFilter && colorFilter !== 'All') params.set('color', colorFilter);
    if (viewMode && viewMode !== 'active') params.set('view', viewMode);
    if (page > 0) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [searchTerm, categoryFilter, colorFilter, viewMode, page, setSearchParams]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, categoryFilter, colorFilter, viewMode, stockQuickFilter, viewGrouping]);

  const [inventory, setInventory] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const fetchCurrentPage = useCallback(async () => {
    try {
      setLoading(true);
      const { data, count } = await getPaginatedInventory(page, 50, {
        viewMode,
        category: categoryFilter,
        color: colorFilter,
        searchTerm,
        stockQuickFilter,
      }, sortConfig);
      setInventory(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [page, viewMode, categoryFilter, colorFilter, searchTerm, stockQuickFilter, sortConfig]);

  useEffect(() => {
    fetchCurrentPage();
  }, [fetchCurrentPage]);

  useEffect(() => {
    if (!supabase?.channel) return;
    let timeout;
    const unsub = supabase
      .channel("public:inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          fetchCurrentPage();
        }, 500);
      })
      .subscribe();
    return () => {
      clearTimeout(timeout);
      unsub?.unsubscribe?.();
    };
  }, [fetchCurrentPage]);

  const uniqueColors = useMemo(() => {
    const set = new Set();
    inventory.forEach((item) => {
      if (item.color) set.add(item.color);
    });
    return ['All', ...Array.from(set).sort()];
  }, [inventory]);

  React.useEffect(() => {
    const unsub = subscribeToCategories((tree) => setCategoryTree(tree));
    return () => unsub();
  }, []);

  // Modals & Adjust Stock
  const [restockModal, setRestockModal] = useState(null);
  const [adjustMode, setAdjustMode] = useState('add'); // 'add' | 'remove'
  const [adjustReason, setAdjustReason] = useState('Damaged / Defective Garment');
  const [otherReasonText, setOtherReasonText] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [sellModal, setSellModal] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [arColorModal, setArColorModal] = useState(null);
  const [arColorInput, setArColorInput] = useState('');
  const [savingArColor, setSavingArColor] = useState(false);
  const [restockQty, setRestockQty] = useState('');
  const [salePriceInput, setSalePriceInput] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState('cash');
  const [saleIdempotencyKey, setSaleIdempotencyKey] = useState('');

  const handleCloseAdjustModal = useCallback(() => {
    setRestockModal(null);
    setRestockQty('');
    setAdjustMode('add');
    setAdjustReason('Damaged / Defective Garment');
    setOtherReasonText('');
    setIsAdjusting(false);
  }, []);

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      if (restockModal) handleCloseAdjustModal();
      else if (sellModal) setSellModal(null);
      else if (arColorModal) setArColorModal(null);
      else if (activeMenuId) setActiveMenuId(null);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [restockModal, sellModal, arColorModal, activeMenuId, handleCloseAdjustModal]);

  useEffect(() => {
    setArColorInput(arColorModal?.hexColor || getChipColorDot(arColorModal?.color) || '');
  }, [arColorModal]);

  const handleResetArColor = async () => {
    if (!arColorModal) return;
    setSavingArColor(true);
    try {
      await updateVariantHexColor(arColorModal.productDocId, arColorModal.color, null);
      toast.success(`AR Color cleared for ${arColorModal.item} (${arColorModal.color || 'Standard'})`);
      setArColorModal(null);
    } catch (err) {
      toast.error(err?.message || 'Failed to clear AR Color');
    } finally {
      setSavingArColor(false);
    }
  };

  const handleSaveArColor = async (e) => {
    e.preventDefault();
    if (!arColorModal) return;
    setSavingArColor(true);
    try {
      await updateVariantHexColor(arColorModal.productDocId, arColorModal.color, arColorInput);
      toast.success(`AR Color updated for ${arColorModal.item} (${arColorModal.color || 'Standard'})`);
      setArColorModal(null);
    } catch (err) {
      toast.error(err?.message || 'Failed to update AR Color');
    } finally {
      setSavingArColor(false);
    }
  };

  const activeInventory = inventory.filter((i) => i.deleted !== true);
  const totalVariants = activeInventory.length;
  const totalStock = activeInventory.reduce((sum, i) => sum + (i.total || 0), 0);
  const totalReserved = activeInventory.reduce((sum, i) => sum + (i.reserved || 0), 0);

  const stockBreakdown = getStockBreakdown(
    activeInventory.map((i) => ({ available: i.available, total: i.total, reserved: i.reserved || 0 }))
  );
  const lowStockCount = stockBreakdown.alerts;
  const reservedCount = activeInventory.filter((i) => (i.reserved || 0) > 0).length;

  const inventoryProductIds = useMemo(() => {
    const ids = new Set();
    inventory.forEach((r) => { if (r.productDocId) ids.add(r.productDocId); });
    return ids;
  }, [inventory]);

  const productsWithNoInventory = useMemo(() =>
    products.filter((p) => !p.deleted && !inventoryProductIds.has(p.id)),
    [products, inventoryProductIds]
  );

  const dropdownCategories = ['All', ...categoryTree.map((c) => c.name)];
  const [noInvBannerDismissed, setNoInvBannerDismissed] = useState(false);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const ariaSort = (key) =>
    sortConfig.key !== key
      ? 'none'
      : sortConfig.direction === 'ascending'
        ? 'ascending'
        : 'descending';

  const productMetaById = useMemo(() => {
    const map = {};
    products.forEach((p) => { map[p.id] = p; });
    return map;
  }, [products]);



  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedItems = inventory;

  // Actions
  const handleRestock = async (e) => {
    e.preventDefault();
    const qty = parseInt(restockQty, 10);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity greater than zero');
      return;
    }
    if (!restockModal) return;

    if (adjustMode === 'remove') {
      if (qty > restockModal.available) {
        toast.error(`Cannot remove more than available stock (${restockModal.available} units). Reserved units (${restockModal.reserved || 0}) are protected.`);
        return;
      }
      const finalReason = adjustReason === 'Other (specify below)' ? (otherReasonText || '').trim() : adjustReason;
      if (!finalReason) {
        toast.error('Please specify a reason for this inventory reduction.');
        return;
      }
      setIsAdjusting(true);
      try {
        await adjustInventoryOnHand(
          restockModal.docId || restockModal.id,
          -qty,
          finalReason
        );
        toast.success(`Reduced ${restockModal.item} (${restockModal.size}, ${restockModal.color || 'Standard'}) -${qty} units (${finalReason})`);
        handleCloseAdjustModal();
      } catch (err) {
        toast.error('Failed to reduce variant stock: ' + (err?.message || ''));
      } finally {
        setIsAdjusting(false);
      }
      return;
    }

    // Default: 'add' (Restock)
    setIsAdjusting(true);
    try {
      await adjustInventoryOnHand(
        restockModal.docId || restockModal.id,
        qty,
        'Restock delivery shipment'
      );
      toast.success(`Restocked ${restockModal.item} (${restockModal.size}, ${restockModal.color || 'Standard'}) +${qty} units`);
      handleCloseAdjustModal();
    } catch (err) {
      toast.error('Failed to restock variant: ' + (err?.message || ''));
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleSell = async (e) => {
    e.preventDefault();
    const qty = parseInt(restockQty, 10);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    if (qty > sellModal.available) {
      toast.error(`Cannot sell more than available stock (${sellModal.available} available). Reserved stock is protected.`);
      return;
    }
    if (!salePaymentMethod) {
      toast.error('Select a payment method');
      return;
    }

    const toastId = toast.loading('Recording in-store sale...');
    try {
      const price = parseFloat(salePriceInput) || 0;
      await recordBoutiqueSale(sellModal, qty, user, price, salePaymentMethod, saleIdempotencyKey);
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
    if (!item) return;
    try {
      await archiveInventoryItem(item.docId || item.id, 'Season decommission');
      toast.success(`Archived ${item.item} (${item.size}, ${item.color || 'Standard'})`);
    } catch (err) {
      toast.error('Failed to archive item: ' + (err?.message || ''));
    } finally {
      setArchiveConfirm(null);
    }
  };

  const handleRestore = async (item) => {
    try {
      await restoreInventoryItem(item.docId || item.id, 'Inventory reactivated');
      toast.success(`Restored ${item.item} (${item.size}, ${item.color || 'Standard'}) to active inventory`);
    } catch (err) {
      toast.error('Failed to restore item: ' + (err?.message || ''));
    }
  };

  const handleSyncStock = async () => {
    if (!canManageLookups) {
      toast.error('Admin privileges required to fix and sync stock.');
      return;
    }
    setIsSyncing(true);
    const toastId = toast.loading('Synchronizing inventory with reservations...');
    try {
      await recalculateAllInventoryStock();
      await logAction(user, 'Manually triggered Inventory Sync');
      toast.success('Inventory re-calculated and synchronized successfully!', { id: toastId });
    } catch (err) {
      console.error('Manual sync failed:', err);
      toast.error('Failed to synchronize inventory: ' + (err?.message || ''), { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePublishProduct = async (inv) => {
    if (inv.available <= 0) {
      toast.error('Cannot add to mobile app without available stock');
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
        sku: inv.sku,
      });
      toast.success(`Product "${inv.item}" is now public on the mobile app`);
    } catch {
      toast.error('Failed to publish product to mobile app');
    }
  };

  const csvField = (value) => {
    let s = String(value ?? '').replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s}"`;
  };

  const handleExportCSV = () => {
    const header = ['SKU/Variant', 'Product', 'Category', 'Size', 'Color', 'Pattern', 'Total', 'Reserved', 'Available'].join(',');
    const rows = inventory.map((i) =>
      [
        csvField(resolveVariantSku(i, productMetaById?.[i.productDocId || i.product_doc_id])),
        csvField(i.item),
        csvField(i.category),
        csvField(i.size),
        csvField(i.color || 'Standard'),
        csvField(i.pattern || 'Solid'),
        i.total,
        i.reserved || 0,
        i.available,
      ].join(',')
    );
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`JezSy_Inventory_${viewMode}_${timestamp}.csv`, [header, ...rows].join('\n'));
    toast.success('Inventory exported as CSV');
  };

  // Grouping helper when viewGrouping === 'grouped'
  const groupedSections = useMemo(() => {
    if (viewGrouping !== 'grouped') return null;
    const sections = new Map();
    pagedItems.forEach((item) => {
      const cat = item.category || 'Uncategorized';
      if (!sections.has(cat)) {
        sections.set(cat, []);
      }
      sections.get(cat).push(item);
    });
    return Array.from(sections.entries());
  }, [viewGrouping, pagedItems]);

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Inventory' }]}
        title="Inventory Management"
        subtitle="Track stock levels and quantities per exact variant across all products"
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
            {canManageLookups && (
              <button
                className="btn-outline flex-center gap-2"
                onClick={handleSyncStock}
                disabled={isSyncing}
              >
                <RefreshCw size={18} className={isSyncing ? 'spin' : ''} />
                {isSyncing ? 'Syncing...' : 'Fix & Sync Stock'}
              </button>
            )}
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

      {/* Metric Summary Cards */}
      <div className="inv-summary-grid">
        <div
          className={`card inv-stat-card inv-stat-clickable${selectedStatCard === 'variants' && stockQuickFilter === 'all' ? ' inv-stat-active inv-stat-active--blue' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Show all variants"
          onClick={() => handleCardClick('variants', 'all')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick('variants', 'all')}
        >
          <div className="icon-bg-soft blue">
            <PackageOpen size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label">Total Active Variants</p>
            <h3>{totalVariants}</h3>
          </div>
        </div>
        <div
          className={`card inv-stat-card inv-stat-clickable${selectedStatCard === 'units' && stockQuickFilter === 'all' ? ' inv-stat-active inv-stat-active--green' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Show all stock units"
          onClick={() => handleCardClick('units', 'all')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick('units', 'all')}
        >
          <div className="icon-bg-soft green">
            <Package size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label">Total Stock Units</p>
            <h3>{totalStock.toLocaleString()}</h3>
          </div>
        </div>
        <div
          className={`card inv-stat-card inv-stat-clickable${stockQuickFilter === 'reserved' ? ' inv-stat-active inv-stat-active--orange' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Filter by reserved units"
          onClick={() => handleCardClick('reserved', 'reserved')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick('reserved', 'reserved')}
        >
          <div className="icon-bg-soft orange">
            <PackageMinus size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label">Reserved Units</p>
            <h3>{totalReserved.toLocaleString()}</h3>
          </div>
        </div>
        <div
          className={`card inv-stat-card inv-stat-clickable${stockQuickFilter === 'alerts' ? ' inv-stat-active inv-stat-active--red' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Filter by stock alerts"
          onClick={() => handleCardClick('alerts', 'alerts')}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleCardClick('alerts', 'alerts')}
        >
          <div className="icon-bg-soft red">
            <AlertTriangle size={24} />
          </div>
          <div className="inv-stat-content">
            <p className="stat-label text-danger font-medium">Stock Alerts</p>
            <h3 className="text-danger">{lowStockCount}</h3>
            {lowStockCount > 0 ? (
              <p className="stat-subtext text-danger font-medium mt-1">
                {stockBreakdown.noStock > 0 ? `${stockBreakdown.noStock} out of stock` : `${lowStockCount} items need restock`}
              </p>
            ) : (
              <p className="stat-subtext text-muted mt-1">All stock levels healthy</p>
            )}
          </div>
        </div>
      </div>


      {/* Catalog products missing inventory warning */}
      {!loading && !loadingProducts && !noInvBannerDismissed && productsWithNoInventory.length > 0 && (
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
              -- Open each product in the Catalog and add size variants, or add rows directly through the Admin panel.
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

      {/* Main Table Card */}
      <div className="card mt-2" ref={tableCardRef}>
        <div className="inv-toolbar">
          {/* Tier 1: Navigation Tabs & View Controls */}
          <div className="inv-toolbar-header">
            <div className="inv-nav-tabs">
              <button
                type="button"
                className={`inv-nav-tab ${activeTab === 'inventory' ? 'active' : ''}`}
                onClick={() => setActiveTab('inventory')}
              >
                <Package size={15} /> Inventory Grid
              </button>
              <button
                type="button"
                className={`inv-nav-tab ${activeTab === 'waitlist' ? 'active' : ''}`}
                onClick={() => setActiveTab('waitlist')}
              >
                Customer Waitlist Demand
              </button>
            </div>

            {activeTab === 'inventory' && (
              <div className="inv-toolbar-view-controls">
                {/* View Grouping Toggle */}
                <div className="view-mode-toggle" style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className={`btn-outline btn-sm ${viewGrouping === 'flat' ? 'active' : ''}`}
                    onClick={() => setViewGrouping('flat')}
                    title="Flat discrete list"
                    aria-label="Flat discrete list"
                  >
                    <List size={15} />
                  </button>
                  <button
                    type="button"
                    className={`btn-outline btn-sm ${viewGrouping === 'grouped' ? 'active' : ''}`}
                    onClick={() => setViewGrouping('grouped')}
                    title="Group by category divider"
                    aria-label="Group by category divider"
                  >
                    <Layers size={15} />
                  </button>
                </div>

                {isAdminUnlocked && (
                  <div className="archive-toggle-tabs">
                    <button
                      type="button"
                      className={`archive-toggle-btn ${viewMode === 'active' ? 'active' : ''}`}
                      onClick={() => setViewMode('active')}
                    >
                      Active ({inventory.filter((i) => i.deleted !== true).length})
                    </button>
                    <button
                      type="button"
                      className={`archive-toggle-btn ${viewMode === 'archived' ? 'active' : ''}`}
                      onClick={() => setViewMode('archived')}
                    >
                      <Archive size={14} /> Archived ({inventory.filter((i) => i.deleted === true).length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tier 2: Search, Filters & Quick Status Chips */}
          {activeTab === 'inventory' && (
            <div className="inv-toolbar-filter-row">
              <div className="inv-search-and-dropdowns">
                <div className="search-box inv-search-box">
                  <Search size={18} className="search-icon" />
                  <input
                    id="inventory-search-input"
                    name="inventorySearch"
                    type="text"
                    placeholder="Search SKU, Product, Color..."
                    aria-label="Search variant SKU, product name, or color"
                    autoComplete="off"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-field pl-10"
                  />
                </div>

                <select
                  id="field_inv_category"
                  name="field_inv_category"
                  className="input-field inv-select-category"
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
                    id="field_inv_color"
                    name="field_inv_color"
                    className="input-field inv-select-color"
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
              </div>

              <div className="inv-quick-filters-bar">
                <button
                  type="button"
                  className={`quick-filter-chip ${stockQuickFilter === 'all' ? 'active' : ''}`}
                  onClick={() => { setStockQuickFilter('all'); setSelectedStatCard('variants'); setPage(0); }}
                >
                  All Variants ({totalCount})
                </button>
                <button
                  type="button"
                  className={`quick-filter-chip alert-chip ${stockQuickFilter === 'alerts' ? 'active' : ''}`}
                  onClick={() => { setStockQuickFilter('alerts'); setSelectedStatCard('alerts'); setPage(0); }}
                >
                  <AlertTriangle size={13} /> Stock Alerts ({lowStockCount})
                </button>
                <button
                  type="button"
                  className={`quick-filter-chip reserved-chip ${stockQuickFilter === 'reserved' ? 'active' : ''}`}
                  onClick={() => { setStockQuickFilter('reserved'); setSelectedStatCard('reserved'); setPage(0); }}
                >
                  Reserved ({reservedCount})
                </button>
              </div>
            </div>
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
                    <th>Product</th>
                    <th>Color / Size</th>
                    <th className="text-right">Interested Customers</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistDemand.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center p-8 text-secondary">
                        No customer waitlist requests recorded.
                      </td>
                    </tr>
                  ) : (
                    waitlistDemand.map((w) => (
                      <tr key={w.id || w.productId + w.size}>
                        <td className="font-medium">{w.productName}</td>
                        <td>
                          {w.color && <span className="color-badge mr-2">{w.color}</span>}
                          {w.size && <span className="size-badge">{w.size}</span>}
                        </td>
                        <td className="text-right font-semibold text-primary">{w.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="table-container table-sticky-container">
            {loading ? (
              <SkeletonTable columns={TABLE_COLUMNS} rows={8} />
            ) : (
              <table className="table inv-table">
                <thead className="table-sticky-header">
                  <tr>
                    <th scope="col" className="th-sku" aria-sort={ariaSort('sku')}>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => handleSort('sku')}
                      >
                        Variant SKU
                        {sortConfig.key === 'sku' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-product" aria-sort={ariaSort('item')}>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => handleSort('item')}
                      >
                        Product & Category
                        {sortConfig.key === 'item' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-size text-center" aria-sort={ariaSort('size')}>
                      <button
                        type="button"
                        className="th-sort-btn justify-center"
                        onClick={() => handleSort('size')}
                      >
                        Size
                        {sortConfig.key === 'size' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-color" aria-sort={ariaSort('color')}>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => handleSort('color')}
                      >
                        Color
                        {sortConfig.key === 'color' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-num text-right" aria-sort={ariaSort('total')}>
                      <button
                        type="button"
                        className="th-sort-btn justify-end"
                        onClick={() => handleSort('total')}
                      >
                        Total
                        {sortConfig.key === 'total' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-num text-right" aria-sort={ariaSort('reserved')}>
                      <button
                        type="button"
                        className="th-sort-btn justify-end"
                        onClick={() => handleSort('reserved')}
                      >
                        Reserved
                        {sortConfig.key === 'reserved' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-num text-right" aria-sort={ariaSort('available')}>
                      <button
                        type="button"
                        className="th-sort-btn justify-end"
                        onClick={() => handleSort('available')}
                      >
                        Available
                        {sortConfig.key === 'available' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-stock" aria-sort={ariaSort('stockStatus')}>
                      <button
                        type="button"
                        className="th-sort-btn"
                        onClick={() => handleSort('stockStatus')}
                      >
                        Stock Status
                        {sortConfig.key === 'stockStatus' && (
                          <span aria-hidden="true">{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                        )}
                      </button>
                    </th>

                    <th scope="col" className="th-actions text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.length === 0 ? (
                    <tr>
                      <td colSpan={TABLE_COLUMNS}>
                        <div className="empty-state flex-col flex-center gap-3 p-8">
                          <div className="icon-bg-large bg-light text-secondary mb-2 rounded-full p-4">
                            <PackageOpen size={48} opacity={0.5} />
                          </div>
                          <h3 className="text-lg font-medium">No inventory items found</h3>
                          <p className="text-secondary text-center max-w-sm">
                            We couldn&apos;t find any inventory records matching your active filters.
                          </p>
                          {(searchTerm || categoryFilter !== 'All' || colorFilter !== 'All' || stockQuickFilter !== 'all') && (
                            <button
                              className="btn-outline mt-2"
                              onClick={() => {
                                setSearchTerm('');
                                setCategoryFilter('All');
                                setColorFilter('All');
                                setStockQuickFilter('all');
                              }}
                            >
                              Reset Filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : viewGrouping === 'grouped' && groupedSections ? (
                    groupedSections.map(([categoryName, items]) => (
                      <React.Fragment key={categoryName}>
                        <tr className="inv-category-divider">
                          <td colSpan={TABLE_COLUMNS}>
                            <div className="inv-category-divider-content">
                              <span className="divider-label">{categoryName}</span>
                              <span className="divider-count">{items.length} {items.length === 1 ? 'variant' : 'variants'}</span>
                            </div>
                          </td>
                        </tr>
                        {items.map((item) => (
                          <VariantInvRow
                            key={item.id || item.sku}
                            item={item}
                            isAdminUnlocked={isAdminUnlocked}
                            handleRestore={handleRestore}
                            handlePublishProduct={handlePublishProduct}
                            setRestockModal={setRestockModal}
                            setRestockQty={setRestockQty}
                        setAdjustMode={setAdjustMode}
                        setAdjustReason={setAdjustReason}
                        setOtherReasonText={setOtherReasonText}
                            setSellModal={setSellModal}
                            setSalePriceInput={setSalePriceInput}
                            setSalePaymentMethod={setSalePaymentMethod}
                            setSaleIdempotencyKey={setSaleIdempotencyKey}
                            setArchiveConfirm={setArchiveConfirm}
                            setArColorModal={setArColorModal}
                            canManageLookups={canManageLookups}
                            productMetaById={productMetaById}
                            activeMenuId={activeMenuId}
                            setActiveMenuId={setActiveMenuId}
                          />
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    pagedItems.map((item) => (
                      <VariantInvRow
                        key={item.id || item.sku}
                        item={item}
                        isAdminUnlocked={isAdminUnlocked}
                        handleRestore={handleRestore}
                        handlePublishProduct={handlePublishProduct}
                        setRestockModal={setRestockModal}
                        setRestockQty={setRestockQty}
                        setAdjustMode={setAdjustMode}
                        setAdjustReason={setAdjustReason}
                        setOtherReasonText={setOtherReasonText}
                        setSellModal={setSellModal}
                        setSalePriceInput={setSalePriceInput}
                        setSalePaymentMethod={setSalePaymentMethod}
                        setSaleIdempotencyKey={setSaleIdempotencyKey}
                        setArchiveConfirm={setArchiveConfirm}
                        setArColorModal={setArColorModal}
                        canManageLookups={canManageLookups}
                        productMetaById={productMetaById}
                        activeMenuId={activeMenuId}
                        setActiveMenuId={setActiveMenuId}
                      />
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="inv-pagination" role="navigation" aria-label="Inventory table pagination">
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  aria-label="Go to previous page"
                >
                  ← Previous
                </button>
                <span className="inv-pagination-info text-sm text-secondary">
                  Page {page + 1} of {totalPages} ({totalCount} variants)
                </span>
                <button
                  type="button"
                  className="btn-outline btn-sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Go to next page"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== ADJUST STOCK MODAL (Add / Restock or Remove / Write-off) ===== */}
      {restockModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) handleCloseAdjustModal(); }}
          role="button"
          tabIndex={0}
          aria-label="Close restock dialog"
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleCloseAdjustModal(); } }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restock-dialog-title"
            style={{ maxWidth: 480 }}
          >
            <div className="modal-header">
              <h2 id="restock-dialog-title">
                {adjustMode === 'add' ? 'Restock Variant' : 'Reduce Stock (Write-Off)'}
              </h2>
              <button className="close-btn" onClick={handleCloseAdjustModal} aria-label="Close dialog">
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleRestock}>
              {/* Mode Switcher Toggle */}
              <div className="adjust-mode-toggle" role="tablist" aria-label="Stock adjustment mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={adjustMode === 'add'}
                  className={`adjust-toggle-btn ${adjustMode === 'add' ? 'active' : ''}`}
                  onClick={() => {
                    setAdjustMode('add');
                    setRestockQty('');
                  }}
                >
                  <PackagePlus size={16} />
                  <span>Add Stock (Restock)</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={adjustMode === 'remove'}
                  className={`adjust-toggle-btn ${adjustMode === 'remove' ? 'active danger' : ''}`}
                  onClick={() => {
                    setAdjustMode('remove');
                    setRestockQty('');
                  }}
                >
                  <PackageMinus size={16} />
                  <span>Remove Stock (Write-Off)</span>
                </button>
              </div>

              <p className="text-secondary text-sm" style={{ marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
                {adjustMode === 'add'
                  ? 'Adds inventory on hand to this exact variant. Other sizes or colors are unaffected.'
                  : 'Deducts physical stock for damaged garments, audit corrections, or write-offs. Reserved customer units are strictly protected.'}
              </p>

              <div className="restock-item-info" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <strong>{restockModal.item}</strong>
                <span className="size-badge">{restockModal.size}</span>
                {restockModal.color && <span className="color-badge">{restockModal.color}</span>}
                <span className="sku-code">
                  {resolveVariantSku(restockModal, productMetaById?.[restockModal.productDocId || restockModal.product_doc_id])}
                </span>
              </div>

              <div className="stock-metrics-box" style={{ background: 'var(--cream, #f9fafb)', padding: '0.75rem', borderRadius: '6px', margin: '0.75rem 0', display: 'flex', justifyContent: 'space-between' }}>
                <div>Available: <strong className="text-success">{restockModal.available}</strong></div>
                <div>Reserved: <strong className="text-reserved-active">{restockModal.reserved || 0}</strong></div>
                <div>Total On Hand: <strong>{restockModal.total}</strong></div>
              </div>

              <div className="form-group">
                <label className="label" htmlFor="restock-qty">
                  {adjustMode === 'add' ? 'Quantity to Add' : 'Quantity to Remove'}
                </label>
                <input
                  autoComplete="off"
                  id="restock-qty"
                  type="number"
                  className="input-field"
                  min="1"
                  max={adjustMode === 'remove' ? restockModal.available : undefined}
                  placeholder={adjustMode === 'add' ? 'e.g. 10' : `Max ${restockModal.available}`}
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  required
                  disabled={isAdjusting || (adjustMode === 'remove' && restockModal.available <= 0)}
                />
                {adjustMode === 'remove' && (
                  <small className="text-secondary" style={{ display: 'block', marginTop: '0.25rem' }}>
                    {restockModal.available > 0
                      ? `Maximum removable: ${restockModal.available} units (cannot exceed available stock)`
                      : 'No available stock to remove. Reserved units cannot be written off.'}
                  </small>
                )}
              </div>

              {adjustMode === 'remove' && (
                <>
                  <div className="form-group" style={{ marginTop: '0.75rem' }}>
                    <label className="label" htmlFor="reduction-reason">Reason for Reduction</label>
                    <select
                      id="reduction-reason"
                      className="input-field"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      required
                    >
                      {REDUCTION_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  {adjustReason === 'Other (specify below)' && (
                    <div className="form-group" style={{ marginTop: '0.5rem' }}>
                      <label className="label" htmlFor="custom-reduction-reason">Specific Reason</label>
                      <input
                        autoComplete="off"
                        id="custom-reduction-reason"
                        type="text"
                        className="input-field"
                        placeholder="e.g. Broken zipper during fitting session"
                        value={otherReasonText}
                        onChange={(e) => setOtherReasonText(e.target.value)}
                        required
                        maxLength={200}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={handleCloseAdjustModal} disabled={isAdjusting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={adjustMode === 'add' ? 'btn-primary' : 'btn-danger'}
                  disabled={isAdjusting || (adjustMode === 'remove' && restockModal.available <= 0)}
                >
                  {isAdjusting
                    ? 'Saving...'
                    : adjustMode === 'add'
                    ? 'Confirm Restock'
                    : 'Confirm Reduction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== SELL / POS MODAL (Guards against overselling & protects reserved units) ===== */}
      {sellModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setSellModal(null); }}
          role="button"
          tabIndex={0}
          aria-label="Close sale dialog"
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSellModal(null); } }}
        >
          <div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pos-sale-dialog-title"
            style={{ maxWidth: 500 }}
          >
            <div className="modal-header">
              <div className="flex-center gap-2">
                <ShoppingCart size={20} className="text-secondary" />
                <h2 id="pos-sale-dialog-title">Record In-Store Sale</h2>
              </div>
              <button className="close-btn" onClick={() => setSellModal(null)} aria-label="Close dialog">
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleSell}>
              <p className="text-secondary text-sm" style={{ marginTop: '-0.5rem' }}>
                Deducts physical stock for a walk-in boutique sale for this exact variant.
              </p>
              <div className="restock-item-info" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <strong>{sellModal.item}</strong>
                <span className="size-badge">{sellModal.size}</span>
                {sellModal.color && <span className="color-badge">{sellModal.color}</span>}
                <span className="sku-code">
                  {resolveVariantSku(sellModal, productMetaById?.[sellModal.productDocId || sellModal.product_doc_id])}
                </span>
              </div>
              <div className="p-3 bg-light rounded-lg mt-2 mb-4" style={{ background: 'var(--cream, #f9fafb)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                  <span className="text-secondary">Available Stock:</span>
                  <span className="font-bold text-success">{sellModal.available} units</span>
                </div>
                {sellModal.reserved > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px', color: 'var(--stock-low)' }}>
                    <span>Reserved for Orders (Protected):</span>
                    <span>{sellModal.reserved} units</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span className="text-secondary">Expected Price:</span>
                  <span className="font-bold">
                    ₱{productMetaById[sellModal.productDocId]?.price
                      ? Number(productMetaById[sellModal.productDocId].price).toLocaleString()
                      : '--'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="label" htmlFor="sell-unit-price">Actual Unit Price (₱)</label>
                  <input
                    autoComplete="off"
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
                    autoComplete="off"
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

              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label className="label" htmlFor="sell-payment-method">Payment Method</label>
                <select
                  id="sell-payment-method"
                  className="input-field"
                  value={salePaymentMethod}
                  onChange={(e) => setSalePaymentMethod(e.target.value)}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="ewallet">E-Wallet</option>
                </select>
              </div>

              {restockQty && parseInt(restockQty, 10) > 0 && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.75rem', marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#065f46' }}>
                    <span>Total Transaction:</span>
                    <span>₱{((parseFloat(salePriceInput) || 0) * parseInt(restockQty, 10)).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '4px' }}>
                    Remaining Stock: {sellModal.available - parseInt(restockQty, 10)} units
                  </div>
                </div>
              )}

              <div className="modal-footer" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn-outline" onClick={() => setSellModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ backgroundColor: 'var(--stock-healthy, #10b981)' }}>
                  Confirm Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== AR COLOR MODAL ===== */}
      {arColorModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setArColorModal(null); }}
          role="button"
          tabIndex={0}
          aria-label="Close AR Color dialog"
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setArColorModal(null); } }}
        >
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 id="ar-color-dialog-title">Configure AR Try-On Color</h2>
              <button className="close-btn" onClick={() => setArColorModal(null)} aria-label="Close dialog">
                &times;
              </button>
            </div>
            <form className="modal-body" onSubmit={handleSaveArColor}>
              <p className="text-secondary text-sm" style={{ marginTop: '-0.5rem' }}>
                Sets the approximate hex color applied when customers try on this garment color in AR.
              </p>
              <div className="restock-item-info" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                <strong>{arColorModal.item}</strong>
                <span className="color-badge">{arColorModal.color || 'Standard'}</span>
              </div>
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label className="label" htmlFor="ar-color-hex">Hex Color Code</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="color"
                    aria-label="Pick AR color"
                    value={/^#[0-9a-fA-F]{6}$/.test(arColorInput) ? arColorInput : '#808080'}
                    onChange={(e) => setArColorInput(e.target.value)}
                    style={{ width: 40, height: 40, padding: 0, border: 'none', cursor: 'pointer', flexShrink: 0, borderRadius: '4px' }}
                  />
                  <input
                    autoComplete="off"
                    id="ar-color-hex"
                    type="text"
                    className="input-field"
                    placeholder="#18233F"
                    value={arColorInput}
                    onChange={(e) => setArColorInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <p className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>
                  Leave blank to restore the 3D model&apos;s authored appearance.
                </p>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div>
                  {arColorModal.hexColor && (
                    <button
                      type="button"
                      className="btn-outline text-danger"
                      onClick={handleResetArColor}
                      disabled={savingArColor}
                    >
                      Clear AR Tint
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn-outline" onClick={() => setArColorModal(null)} disabled={savingArColor}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={savingArColor}>
                    {savingArColor ? 'Saving...' : 'Save AR Color'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Archive Dialog */}
      <ConfirmDialog
        isOpen={!!archiveConfirm}
        title="Archive Variant?"
        message={`Archive ${archiveConfirm?.item} (${archiveConfirm?.size}, ${archiveConfirm?.color || 'Standard'})? Historical metrics will be preserved and you can restore it anytime.`}
        confirmText="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveConfirm(null)}
      />
    </div>
  );
};

export default Inventory;
