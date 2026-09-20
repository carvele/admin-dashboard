/* eslint-disable @typescript-eslint/no-unused-vars */
 
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Tag as TagIcon,
  Edit,
  Archive,
  ArchiveRestore,
  Sparkles,
  Star,
  Flame,
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Layers,
  Shirt,
  Palette,
  Package,
  ArrowUpDown,
} from 'lucide-react';
import { getStockHealth } from '../../utils/stockStatus';
import ProductReviewsModal from './ProductReviewsModal';
import ConfirmDialog from '../../components/ConfirmDialog';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import StockStatusBadge from '../../components/inventory/StockStatusBadge';
import PageHeader from '../../components/PageHeader';
import {
  getProducts,
  updateProduct,
  archiveProduct,
  restoreProduct,
  getCategories,
  getInventory,
} from '../../services/productService';
import { getReservations } from '../../services/reservationService';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import ImageWithFallback from '../../components/ImageWithFallback';
import { COLOR_CATEGORIES } from '../../utils/constants';
import { Logger } from '../../utils/Logger';
import './ClothingCatalog.css';

const ClothingCatalog = () => {
  const { isAdminUnlocked, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  // subcatName → parentName map (e.g. 'Sneakers' → 'Footwear', 'Boots' → 'Footwear')
  // Used so the catalog filter works whether products.category stores a parent
  // name ('Footwear') or a subcategory name ('Sneakers' / 'Boots').
  const [subcatToParent, setSubcatToParent] = useState({});
  const [loading, setLoading] = useState(true);
  // productDocId → { available, total, reserved } aggregated across all sizes
  const [inventoryMap, setInventoryMap] = useState({});

  useEffect(() => {
    // Fetch products, reservations, and inventory in one parallel pass.
    const fetchProducts = async () => {
      try {
        const [prods, reservations, inventoryRows] = await Promise.all([
          getProducts(true), // includeDeleted = true
          getReservations(),
          getInventory(),    // all inventory rows (non-deleted filtered below)
        ]);

        // Count reservations per product
        const reservationCounts = {};
        (reservations || []).forEach(r => {
          const pId = r.productId || '';
          const pName = r.productName || r.outfit || '';
          if (pId) {
            reservationCounts[pId] = (reservationCounts[pId] || 0) + 1;
          }
          if (pName) {
            reservationCounts[pName] = (reservationCounts[pName] || 0) + 1;
          }
        });

        const catalogWithReservations = (prods || []).map(p => ({
          ...p,
          reservationCount: reservationCounts[p.docId] || reservationCounts[p.name] || reservationCounts[p.id] || 0
        }));

        // Build productDocId → aggregated stock map (active rows only)
        const map = {};
        (inventoryRows || [])
          .filter(row => row.deleted !== true)
          .forEach(row => {
            const key = row.productDocId || row.product_doc_id;
            if (!key) return;
            if (!map[key]) map[key] = { available: 0, total: 0, reserved: 0, sizes: {} };
            map[key].available += Number(row.available || 0);
            map[key].total     += Number(row.total     || 0);
            map[key].reserved  += Number(row.reserved  || 0);
            
            const sz = row.size;
            if (sz) {
              if (!map[key].sizes[sz]) map[key].sizes[sz] = { available: 0, total: 0 };
              map[key].sizes[sz].available += Number(row.available || 0);
              map[key].sizes[sz].total += Number(row.total || 0);
            }
          });
        setInventoryMap(map);

        setCatalog(catalogWithReservations);
      } catch {
        toast.error('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();

    // Fetch dynamic categories once
    const fetchCategories = async () => {
      try {
        const cats = await getCategories();
        setCategoryTree(cats || []);
        setDbCategories((cats || []).map((c) => c.name));
        // Build subcategory → parent name lookup
        const map = {};
        (cats || []).forEach((parent) => {
          (parent.subcategories || []).forEach((sub) => {
            map[sub.name] = parent.name;
          });
          // Parent also maps to itself so an exact parent match still works
          map[parent.name] = parent.name;
        });
        setSubcatToParent(map);
      } catch (err) {
        Logger.error('Failed to load categories for filter dropdown', err);
        setCategoryTree([]);
        setDbCategories([]);
      }
    };
    fetchCategories();
  }, []);

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [activeCategory, setActiveCategory] = useState(() => searchParams.get('category') || 'All');
  const [activeType, setActiveType] = useState(() => searchParams.get('type') || 'All');
  const [activeColor, setActiveColor] = useState(() => searchParams.get('color') || 'All Colors');
  const [activeStock, setActiveStock] = useState(() => searchParams.get('stock') || 'all');
  const [activeTag, setActiveTag] = useState(() => searchParams.get('tag') || 'All Tags');
  const [viewMode, setViewMode] = useState(() => searchParams.get('view') || 'active'); // 'active' | 'archived'

  // Keep the catalog context in the URL so it survives opening, saving, or cancelling a product form.
  const catalogContext = React.useMemo(() => {
    const params = new URLSearchParams();
    if (searchTerm.trim()) params.set('search', searchTerm.trim());
    if (activeCategory !== 'All') params.set('category', activeCategory);
    if (activeType !== 'All') params.set('type', activeType);
    if (activeColor !== 'All Colors') params.set('color', activeColor);
    if (activeStock !== 'all') params.set('stock', activeStock);
    if (activeTag !== 'All Tags') params.set('tag', activeTag);
    if (viewMode !== 'active') params.set('view', viewMode);
    return params.toString();
  }, [searchTerm, activeCategory, activeType, activeColor, activeStock, activeTag, viewMode]);

  useEffect(() => {
    if (searchParams.toString() !== catalogContext) {
      setSearchParams(catalogContext, { replace: true });
    }
  }, [catalogContext, searchParams, setSearchParams]);

  const withCatalogContext = (path) => (catalogContext ? `${path}?${catalogContext}` : path);

  const categories = ['All', ...dbCategories];

  // Dynamically compute all available product types (subcategories)
  const availableTypes = React.useMemo(() => {
    if (activeCategory !== 'All') {
      const selectedParent = categoryTree.find(
        (c) => c.name.toLowerCase() === activeCategory.toLowerCase()
      );
      const types = new Set();
      if (selectedParent) {
        (selectedParent.subcategories || []).forEach((sub) => {
          if (sub.name) types.add(sub.name);
        });
      }
      // Collect any custom subCategory on products belonging to this category
      (catalog || []).forEach((p) => {
        const effectiveParent = subcatToParent[p.category] || p.category || '';
        if (effectiveParent.toLowerCase() === activeCategory.toLowerCase()) {
          const sub = p.subCategory || p.sub_category;
          if (sub && typeof sub === 'string' && sub.trim()) {
            types.add(sub.trim());
          }
        }
      });
      return Array.from(types).sort((a, b) => a.localeCompare(b));
    }

    // When All Categories is selected, group subcategories by parent category
    const grouped = [];
    const seenTypes = new Set();

    categoryTree.forEach((cat) => {
      const catTypes = (cat.subcategories || [])
        .map((s) => s.name)
        .filter(Boolean);
      catTypes.forEach((t) => seenTypes.add(t.toLowerCase()));
      if (catTypes.length > 0) {
        grouped.push({
          category: cat.name,
          types: catTypes.sort((a, b) => a.localeCompare(b)),
        });
      }
    });

    // Also include any orphan product types not present in categoryTree
    const orphanTypes = [];
    (catalog || []).forEach((p) => {
      const sub = p.subCategory || p.sub_category;
      if (sub && typeof sub === 'string' && sub.trim() && !seenTypes.has(sub.trim().toLowerCase())) {
        orphanTypes.push(sub.trim());
        seenTypes.add(sub.trim().toLowerCase());
      }
    });
    if (orphanTypes.length > 0) {
      grouped.push({
        category: 'Other Types',
        types: orphanTypes.sort((a, b) => a.localeCompare(b)),
      });
    }

    return grouped;
  }, [activeCategory, categoryTree, catalog, subcatToParent]);

  const handleCategoryChange = (newCat) => {
    setActiveCategory(newCat);
    if (activeType !== 'All' && newCat !== 'All') {
      const parent = subcatToParent[activeType];
      if (parent && parent.toLowerCase() !== newCat.toLowerCase()) {
        setActiveType('All');
      }
    }
  };

  const handleTypeChange = (newType) => {
    setActiveType(newType);
    if (newType !== 'All' && activeCategory === 'All') {
      const parent = subcatToParent[newType];
      if (parent) {
        setActiveCategory(parent);
      }
    }
  };

  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectedProductForReviews, setSelectedProductForReviews] = useState(null);

  // Dynamically compute all tags used across products + standard presets
  const availableTags = React.useMemo(() => {
    const set = new Set(['AR Try-On', 'New Arrival', 'Limited Edition', 'Sale']);
    (catalog || []).forEach((p) => {
      (p.tags || []).forEach((t) => {
        if (t) set.add(t);
      });
    });
    return Array.from(set);
  }, [catalog]);

  // Auto-expire New Arrival after 7 days, or respect manual toggle
  const isNewArrival = (item) => {
    // 1. Manual override takes priority
    if (item.isNewArrival) return true;

    // 2. Automatic 7-day logic
    // Handle Firebase Timestamp objects or numeric timestamps
    let createdDate = 0;
    if (item.createdAt) {
      if (typeof item.createdAt.toMillis === 'function') {
        createdDate = item.createdAt.toMillis();
      } else if (item.createdAt.seconds) {
        createdDate = item.createdAt.seconds * 1000;
      } else {
        createdDate = new Date(item.createdAt).getTime();
      }
    }

    if (!createdDate) return false;
    
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - createdDate < sevenDays;
  };

  const filteredCatalog = catalog.filter((item) => {
    // Filter by active/archived
    const isArchived = item.deleted === true;
    if (viewMode === 'active' && isArchived) return false;
    if (viewMode === 'archived' && !isArchived) return false;

    const q = (searchTerm || '').trim().toLowerCase();
    const matchesSearch =
      !q ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.styleCode || '').toLowerCase().includes(q) ||
      (item.subCategory || item.sub_category || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q);

    // Resolve the product's effective parent category.
    // products.category may hold either a parent name ('Footwear') or a
    // subcategory name ('Sneakers'/'Boots'). Resolve both via the lookup map.
    const effectiveParentCat = subcatToParent[item.category] || item.category || '';
    const matchesCat =
      activeCategory === 'All' ||
      effectiveParentCat.toLowerCase() === activeCategory.toLowerCase();

    // Type / Subcategory match
    const itemSub = (item.subCategory || item.sub_category || '').trim();
    const itemCat = (item.category || '').trim();
    const matchesType =
      activeType === 'All' ||
      (itemSub && itemSub.toLowerCase() === activeType.toLowerCase()) ||
      (itemCat && itemCat.toLowerCase() === activeType.toLowerCase());

    // A product can have several colours (comma-joined in `color`); match if the
    // selected colour is any of them. Fall back to baseColor for legacy rows.
    const itemColors = item.color
      ? String(item.color).split(',').map((c) => c.trim()).filter(Boolean)
      : (item.baseColor ? [item.baseColor] : []);
    const matchesColor =
      activeColor === 'All Colors' ||
      itemColors.some((c) => c.toLowerCase() === activeColor.toLowerCase());

    // Stock Status match
    const invData = inventoryMap[item.docId] || inventoryMap[item.id];
    const availableStock = invData ? invData.available : (Number(item.stock) || 0);
    let matchesStock = true;
    if (activeStock === 'in-stock') {
      matchesStock = availableStock > 5;
    } else if (activeStock === 'low-stock') {
      matchesStock = availableStock > 0 && availableStock <= 5;
    } else if (activeStock === 'out-of-stock') {
      matchesStock = availableStock === 0;
    }

    const itemTags = item.tags || [];
    const matchesTag = activeTag === 'All Tags' || itemTags.includes(activeTag);

    return matchesSearch && matchesCat && matchesType && matchesColor && matchesStock && matchesTag;
  });

  const [sortBy, setSortBy] = useState('newest');
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(0);

  const sortedCatalog = React.useMemo(() => {
    const list = [...filteredCatalog];
    if (sortBy === 'price-asc') {
      list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortBy === 'price-desc') {
      list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortBy === 'name-asc') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'name-desc') {
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sortBy === 'stock-low') {
      list.sort((a, b) => {
        const aStock = inventoryMap[a.docId]?.available ?? a.stock ?? 0;
        const bStock = inventoryMap[b.docId]?.available ?? b.stock ?? 0;
        return aStock - bStock;
      });
    } else if (sortBy === 'stock-high') {
      list.sort((a, b) => {
        const aStock = inventoryMap[a.docId]?.available ?? a.stock ?? 0;
        const bStock = inventoryMap[b.docId]?.available ?? b.stock ?? 0;
        return bStock - aStock;
      });
    } else {
      // 'newest' default
      list.sort((a, b) => {
        const aTime = new Date(a.createdAt || a.created_at || 0).getTime();
        const bTime = new Date(b.createdAt || b.created_at || 0).getTime();
        return bTime - aTime;
      });
    }
    return list;
  }, [filteredCatalog, sortBy, inventoryMap]);

  const effectivePageSize = pageSize === 'all' ? Math.max(1, sortedCatalog.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(sortedCatalog.length / effectivePageSize));
  const pagedCatalog = React.useMemo(() => {
    return sortedCatalog.slice(page * effectivePageSize, (page + 1) * effectivePageSize);
  }, [sortedCatalog, page, effectivePageSize]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  useEffect(() => {
    setPage(0);
  }, [searchTerm, activeCategory, activeType, activeColor, activeStock, activeTag, sortBy, viewMode, pageSize]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    activeCategory !== 'All' ||
    activeType !== 'All' ||
    activeColor !== 'All Colors' ||
    activeStock !== 'all' ||
    activeTag !== 'All Tags' ||
    sortBy !== 'newest'
  );

  const resetAllFilters = () => {
    setSearchTerm('');
    setActiveCategory('All');
    setActiveType('All');
    setActiveColor('All Colors');
    setActiveStock('all');
    setActiveTag('All Tags');
    setSortBy('newest');
    setPage(0);
  };

  // --- ARCHIVE PRODUCT ---
  const handleArchive = async () => {
    if (!archiveConfirm) return;
    setIsArchiving(true);
    const itemToArchive = archiveConfirm;
    try {
      Logger.info(`Archiving product ${itemToArchive.docId} (${itemToArchive.name})...`);

      // Soft delete — product + linked inventory marked deleted=true
      // All data and images are preserved for historical reference
      await archiveProduct(itemToArchive.docId);

      // Update local state to reflect the change instantly
      setCatalog(catalog.map(c =>
        c.docId === itemToArchive.docId ? { ...c, deleted: true, deletedAt: Date.now() } : c
      ));

      toast.success(`"${itemToArchive.name}" archived successfully. You can restore it anytime.`);
    } catch (e) {
      Logger.error('Archive product error:', e);
      toast.error('Failed to archive product: ' + e.message);
    } finally {
      setIsArchiving(false);
      setArchiveConfirm(null);
    }
  };

  // --- RESTORE PRODUCT ---
  const handleRestore = async (item) => {
    try {
      await restoreProduct(item.docId);
      setCatalog(catalog.map(c =>
        c.docId === item.docId ? { ...c, deleted: false, deletedAt: null } : c
      ));
      toast.success(`"${item.name}" restored to the active catalog.`);
    } catch (e) {
      Logger.error('Restore product error:', e);
      toast.error('Failed to restore product: ' + e.message);
    }
  };

  // --- TOGGLE TAGS ---
  const toggleTag = async (item, tag) => {
    const currentTags = item.tags || [];
    const has = currentTags.includes(tag);
    const newTags = has ? currentTags.filter((t) => t !== tag) : [...currentTags, tag];
    try {
      await updateProduct(item.docId, { tags: newTags });
      setCatalog(catalog.map(c => c.docId === item.docId ? { ...c, tags: newTags } : c));
    } catch {
      toast.error('Failed to update tags');
    }
  };

  // --- TOGGLE FEATURED ---
  const toggleFeature = async (item) => {
    try {
      await updateProduct(item.docId, { isFeatured: !item.isFeatured });
      setCatalog(catalog.map(c => c.docId === item.docId ? { ...c, isFeatured: !c.isFeatured } : c));
      toast.success(`Product ${!item.isFeatured ? 'featured' : 'unfeatured'}`);
    } catch {
      toast.error('Failed to update featured status');
    }
  };

  const handleReviewsChanged = (docId, newAvg, newCount) => {
    setCatalog(catalog.map(c => 
      c.docId === docId ? { ...c, rating: newAvg, reviewCount: newCount } : c
    ));
  };

  return (
    <div className="catalog-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Clothing Catalog' }]}
        title="Clothing Catalog"
        subtitle="Manage products, variants, and gallery"
        category="CATALOG"
        actions={
          isAdminUnlocked && (
            <button
              className="btn-primary flex-center gap-2"
              onClick={() => navigate(withCatalogContext('/catalog/new'))}
            >
              <Plus size={18} /> Add New Product
            </button>
          )
        }
      />

      <div className="catalog-toolbar card">
        {/* Tier 1: Scope toggle (Active/Archived) and Result Count */}
        <div className="catalog-toolbar-header">
          {isAdminUnlocked && (
            <div className="archive-toggle-tabs" role="tablist" aria-label="Catalog View Mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'active'}
                className={`archive-toggle-btn ${viewMode === 'active' ? 'active' : ''}`}
                onClick={() => setViewMode('active')}
              >
                Active ({catalog.filter((c) => !c.deleted).length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'archived'}
                className={`archive-toggle-btn ${viewMode === 'archived' ? 'active' : ''}`}
                onClick={() => setViewMode('archived')}
              >
                <Archive size={14} /> Archived ({catalog.filter((c) => c.deleted).length})
              </button>
            </div>
          )}

          <div className="catalog-header-meta">
            <span className="catalog-results-badge">
              Showing <strong>{filteredCatalog.length}</strong> {filteredCatalog.length === 1 ? 'product' : 'products'}
            </span>
          </div>
        </div>

        {/* Tier 2: Search Box & Filter Controls */}
        <div className="catalog-toolbar-filter-grid">
          {/* Search Box with Search icon & Instant Clear */}
          <div className="catalog-search-wrapper">
            <Search size={16} className="search-icon" />
            <input
              id="catalog-search-input"
              name="catalogSearch"
              type="text"
              placeholder="Search by name, style, or SKU..."
              aria-label="Search products"
              autoComplete="off"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field catalog-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="catalog-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search query"
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Dropdown (All Categories) */}
          <div className="catalog-filter-field" title="Filter by category">
            <Layers size={14} className="filter-field-icon" />
            <select
              autoComplete="off"
              id="catalog-category-select"
              name="catalogCategory"
              className="input-field catalog-select"
              value={activeCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="All">All Categories</option>
              {dbCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Product Type Dropdown (All Types - includes all subcategories / types) */}
          <div className="catalog-filter-field" title="Filter by product type">
            <Shirt size={14} className="filter-field-icon" />
            <select
              autoComplete="off"
              id="catalog-type-select"
              name="catalogType"
              className="input-field catalog-select"
              value={activeType}
              onChange={(e) => handleTypeChange(e.target.value)}
              aria-label="Filter by product type"
            >
              <option value="All">
                {activeCategory === 'All' ? 'All Types' : `All ${activeCategory} Types`}
              </option>
              {activeCategory === 'All'
                ? availableTypes.map((group) => (
                    <optgroup key={group.category} label={group.category}>
                      {group.types.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
            </select>
          </div>

          {/* Color Dropdown */}
          <div className="catalog-filter-field" title="Filter by color">
            <Palette size={14} className="filter-field-icon" />
            <select
              autoComplete="off"
              id="catalog-color-select"
              name="catalogColor"
              className="input-field catalog-select"
              value={activeColor}
              onChange={(e) => setActiveColor(e.target.value)}
              aria-label="Filter by color"
            >
              <option value="All Colors">All Colors</option>
              {COLOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status Dropdown */}
          <div className="catalog-filter-field" title="Filter by stock status">
            <Package size={14} className="filter-field-icon" />
            <select
              autoComplete="off"
              id="catalog-stock-select"
              name="catalogStock"
              className="input-field catalog-select"
              value={activeStock}
              onChange={(e) => setActiveStock(e.target.value)}
              aria-label="Filter by stock status"
            >
              <option value="all">All Stock Status</option>
              <option value="in-stock">In Stock (&gt;5)</option>
              <option value="low-stock">Low Stock (1–5)</option>
              <option value="out-of-stock">Out of Stock (0)</option>
            </select>
          </div>

          {/* Tags Dropdown */}
          <div className="catalog-filter-field" title="Filter by tag">
            <Sparkles size={14} className="filter-field-icon" />
            <select
              autoComplete="off"
              id="catalog-tag-select"
              name="catalogTag"
              className="input-field catalog-select"
              value={activeTag}
              onChange={(e) => setActiveTag(e.target.value)}
              aria-label="Filter by tags"
            >
              <option value="All Tags">All Tags</option>
              {availableTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="catalog-filter-field" title="Sort products">
            <ArrowUpDown size={14} className="filter-field-icon" />
            <select
              autoComplete="off"
              id="catalog-sort-select"
              name="catalogSort"
              className="input-field catalog-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort products by"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="price-asc">Sort: Price (Low → High)</option>
              <option value="price-desc">Sort: Price (High → Low)</option>
              <option value="name-asc">Sort: Name (A → Z)</option>
              <option value="name-desc">Sort: Name (Z → A)</option>
              <option value="stock-low">Sort: Stock (Low → High)</option>
              <option value="stock-high">Sort: Stock (High → Low)</option>
            </select>
          </div>
        </div>

        {/* Tier 3: Active Filters & Quick Clear Row */}
        {hasActiveFilters && (
          <div className="catalog-active-filters-row">
            <span className="active-filters-label">Active filters:</span>
            <div className="active-filter-chips">
              {searchTerm.trim() && (
                <span className="active-filter-chip">
                  Search: &ldquo;{searchTerm}&rdquo;
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Remove search filter"
                    title="Remove search"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {activeCategory !== 'All' && (
                <span className="active-filter-chip">
                  Category: {activeCategory}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory('All');
                      setActiveType('All');
                    }}
                    aria-label="Remove category filter"
                    title="Remove category"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {activeType !== 'All' && (
                <span className="active-filter-chip">
                  Type: {activeType}
                  <button
                    type="button"
                    onClick={() => setActiveType('All')}
                    aria-label="Remove type filter"
                    title="Remove type"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {activeColor !== 'All Colors' && (
                <span className="active-filter-chip">
                  Color: {activeColor}
                  <button
                    type="button"
                    onClick={() => setActiveColor('All Colors')}
                    aria-label="Remove color filter"
                    title="Remove color"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {activeStock !== 'all' && (
                <span className="active-filter-chip">
                  Stock: {activeStock === 'in-stock' ? 'In Stock' : activeStock === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                  <button
                    type="button"
                    onClick={() => setActiveStock('all')}
                    aria-label="Remove stock filter"
                    title="Remove stock filter"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {activeTag !== 'All Tags' && (
                <span className="active-filter-chip">
                  Tag: {activeTag}
                  <button
                    type="button"
                    onClick={() => setActiveTag('All Tags')}
                    aria-label="Remove tag filter"
                    title="Remove tag"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
              {sortBy !== 'newest' && (
                <span className="active-filter-chip">
                  Sort: {
                    sortBy === 'price-asc' ? 'Price: Low → High' :
                    sortBy === 'price-desc' ? 'Price: High → Low' :
                    sortBy === 'name-asc' ? 'Name: A → Z' :
                    sortBy === 'name-desc' ? 'Name: Z → A' :
                    sortBy === 'stock-low' ? 'Stock: Low → High' : 'Stock: High → Low'
                  }
                  <button
                    type="button"
                    onClick={() => setSortBy('newest')}
                    aria-label="Reset sort"
                    title="Reset sort"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={resetAllFilters}
                className="clear-all-chip-btn"
                title="Reset all filters to default"
              >
                <RotateCcw size={12} /> Reset all
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="catalog-grid-display">
        {pagedCatalog.map((item) => {
          // Use real inventory totals (aggregated across all sizes) when available;
          // fall back to products.stock with the flat 10-unit baseline if no
          // inventory rows exist yet for this product.
          const invData = inventoryMap[item.docId] || inventoryMap[item.id];
          const stockHealth = invData
            ? getStockHealth(invData.available, invData.total || 10, invData.reserved)
            : getStockHealth(item.stock ?? 0, 10, 0);
          // Check for gallery first, else fallback to imageUrl
          const displayUrl =
            item.images && item.images.length > 0
              ? item.images[0]
              : item.image?.secure_url || item.imageUrl;
          const isRealImage = displayUrl && displayUrl.startsWith('http');

          return (
            <div
              key={item.id}
              className={`product-card card ${item.deleted ? 'archived-card' : ''}`}
              onClick={() => navigate(withCatalogContext('/catalog/view/' + item.docId))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(withCatalogContext('/catalog/view/' + item.docId));
                }
              }}
              style={{ cursor: 'pointer' }}
              title="View product details"
            >
              <div className="product-image-area">
                {item.deleted && (
                  <div className="archived-overlay">
                    <Archive size={24} />
                    <span>Archived</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500, marginTop: '4px', opacity: 0.9 }}>
                      Reserved: {item.reservationCount || 0} times
                    </span>
                  </div>
                )}
                {isRealImage ? (
                  <ImageWithFallback
                    src={displayUrl}
                    alt={item.name}
                    className="product-real-image"
                    fallbackSize={48}
                  />
                ) : (
                  <span className="dw-emoji view-xl">{displayUrl || '👗'}</span>
                )}
                {isNewArrival(item) && (
                  <div className="new-arrival-badge">
                    <Sparkles size={10} /> New Arrival
                  </div>
                )}
                
                {/* Conditional AR Badge */}
                {(item.tags || []).includes('AR Try-On') && (
                  <div className={`ar-badge ${item.model_3dUrl ? 'ready' : 'missing'}`}>
                    {item.model_3dUrl ? (
                      <span className="flex align-center gap-1"><Sparkles size={10} /> AR Ready</span>
                    ) : 'AR Missing'}
                  </div>
                )}



                {item.onSale && (
                  <div className="sale-badge" style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    backgroundColor: 'var(--color-danger)',
                    color: 'var(--on-accent)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                    zIndex: 10
                  }}>
                    -{item.discountPercentage}% OFF
                  </div>
                )}
              </div>

              <div className="product-info-area">
                <div className="product-card-top-row">
                  <div className="product-title-group">
                    <h3 className="product-name" title={item.name}>{item.name}</h3>
                    <p className="product-category">
                      {item.category}
                      {item.subCategory && (
                        <span style={{ opacity: 0.6, marginLeft: '0.4rem' }}>
                          • {item.subCategory}
                        </span>
                      )}
                      {item.subSubCategory && (
                        <span style={{ opacity: 0.6, marginLeft: '0.4rem' }}>
                          • {item.subSubCategory}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="product-price-container">
                    {item.onSale ? (
                      <div className="sale-price-group">
                        <div className="original-price" style={{
                          fontSize: '0.85rem',
                          textDecoration: 'line-through',
                          color: 'var(--text-secondary)',
                          lineHeight: 1
                        }}>
                          ₱{(item.price || 0).toLocaleString()}
                        </div>
                        <div className="sale-price" style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: 'var(--color-danger)',
                          lineHeight: 1.2
                        }}>
                          ₱{(item.salePrice || 0).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <span className="product-price">₱{(item.price || 0).toLocaleString()}</span>
                    )}
                  </div>
                </div>

                <div className="flex align-center gap-1 mb-2" style={{ fontSize: '0.85rem' }}>
                  <Star fill="var(--warning)" color="var(--warning)" size={14} />
                  <span style={{ fontWeight: 600 }}>{(item.rating || 0).toFixed(1)}</span>
                  <span className="text-secondary ml-1">({item.reviewCount || 0} reviews)</span>
                  <button
                    className="btn-link p-0 ml-2"
                    style={{ fontSize: '0.85rem', textDecoration: 'underline' }}
                    onClick={(e) => { e.stopPropagation(); setSelectedProductForReviews(item); }}
                  >
                    View
                  </button>
                </div>

                <div className="product-sizes mt-3">
                  {(item.sizes || []).map((size) => {
                    let stockTooltip = 'No inventory data';
                    if (invData && invData.sizes && invData.sizes[size]) {
                      const sData = invData.sizes[size];
                      stockTooltip = `In Stock: ${sData.available} / ${sData.total} units`;
                    }
                    return (
                      <span key={size} className="size-badge" title={stockTooltip}>
                        {size}
                      </span>
                    );
                  })}
                </div>

                {/* Stock Health Badge */}
                {!item.deleted && (
                  <div className="flex align-center gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
                    <StockStatusBadge
                      available={invData ? invData.available : (item.stock ?? 0)}
                      total={invData ? invData.total : 10}
                      reserved={invData ? invData.reserved : 0}
                    />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {invData ? invData.available : (item.stock ?? 0)} / {invData ? invData.total : 10} units
                    </span>
                  </div>
                )}

                {/* Product Tags & Attributes */}
                <div className="product-tags mt-3">
                  {(item.tags || []).map((tag) => (
                    <button
                      key={tag}
                      className="catalog-tag-toggle active"
                      onClick={(e) => { e.stopPropagation(); toggleTag(item, tag); }}
                      title={`Click to remove tag ${tag}`}
                    >
                      <TagIcon size={12} /> {tag}
                    </button>
                  ))}
                  {!(item.tags && item.tags.includes('AR Try-On')) && (
                    <button
                      key="add-ar"
                      className="catalog-tag-toggle"
                      onClick={(e) => { e.stopPropagation(); toggleTag(item, 'AR Try-On'); }}
                      title="Click to enable AR Try-On tag"
                    >
                      <TagIcon size={12} /> AR Try-On
                    </button>
                  )}
                  <button
                    className={`catalog-tag-toggle ${item.isFeatured ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleFeature(item); }}
                    style={{
                      borderColor: item.isFeatured ? 'var(--accent)' : 'transparent',
                      color: item.isFeatured ? 'var(--highlight)' : 'var(--text-secondary)',
                      backgroundColor: item.isFeatured ? 'var(--status-pending-bg)' : 'var(--surface, #1f1f1f)',
                      boxShadow: item.isFeatured ? '0 0 5px rgba(212, 175, 55, 0.3)' : 'none'
                    }}
                  >
                    <Sparkles size={12} /> Featured
                  </button>
                </div>

                {/* CRUD Actions */}
                {isAdminUnlocked && (
                  <div className="product-card-actions mt-3">
                    {item.deleted ? (
                      <button
                        className="btn-outline btn-sm flex-center gap-1"
                        style={{ borderColor: 'var(--stock-healthy)', color: 'var(--stock-healthy)' }}
                        onClick={(e) => { e.stopPropagation(); handleRestore(item); }}
                      >
                        <ArchiveRestore size={14} /> Restore
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn-outline btn-sm flex-center gap-1"
                          onClick={(e) => { e.stopPropagation(); navigate(withCatalogContext('/catalog/edit/' + item.docId)); }}
                        >
                          <Edit size={14} /> Edit
                        </button>
                        {can(user?.role, 'archive_catalog') && (
                          <button
                            className="btn-outline btn-sm btn-archive-outline flex-center gap-1"
                            onClick={(e) => { e.stopPropagation(); setArchiveConfirm(item); }}
                          >
                            <Archive size={14} /> Archive
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="product-card card" style={{ pointerEvents: 'none' }} aria-busy="true">
              <div className="product-image-area" style={{ height: '220px' }}>
                <Skeleton height="100%" />
              </div>
              <div className="product-info-area" style={{ padding: '1rem' }}>
                <Skeleton height={18} width="75%" style={{ marginBottom: '8px' }} />
                <Skeleton height={13} width="45%" style={{ marginBottom: '12px' }} />
                <Skeleton height={16} width="50%" />
              </div>
            </div>
          ))
        ) : filteredCatalog.length === 0 ? (
          <div className="empty-state flex-col flex-center gap-3 p-8" style={{ width: '100%' }}>
            <div style={{ opacity: 0.3, marginBottom: '0.5rem' }}>
              <TagIcon size={48} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              {hasActiveFilters ? 'No Products Match Your Filters' : 'Your Catalog Is Empty'}
            </h3>
            <p
              className="text-secondary text-center"
              style={{ maxWidth: '360px', fontSize: '0.85rem' }}
            >
              {hasActiveFilters
                ? 'Try adjusting or clearing your search terms and filter criteria to see matching products.'
                : 'Add your first product to start building your boutique catalog. Products will be available for reservations and inventory tracking.'}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn-outline mt-3 flex-center gap-2"
                onClick={resetAllFilters}
              >
                <RotateCcw size={16} /> Reset All Filters
              </button>
            ) : isAdminUnlocked ? (
              <button
                className="btn-primary mt-3 flex-center gap-2"
                onClick={() => navigate(withCatalogContext('/catalog/new'))}
              >
                <Plus size={16} /> Add First Product
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Premium Pagination & Range Navigator */}
      <div className="catalog-pagination-bar">
        <div className="pagination-range">
          {sortedCatalog.length === 0 ? (
            '0 products'
          ) : (
            <>
              Showing <strong>{page * effectivePageSize + 1}</strong>–<strong>{Math.min(sortedCatalog.length, (page + 1) * effectivePageSize)}</strong> of <strong>{sortedCatalog.length}</strong> items
            </>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination-controls-pills">
            <button
              className="pagination-pill-arrow"
              onClick={() => handlePageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => {
              if (
                i === 0 ||
                i === totalPages - 1 ||
                (i >= page - 1 && i <= page + 1)
              ) {
                return (
                  <button
                    key={i}
                    className={`pagination-pill-btn ${page === i ? 'active' : ''}`}
                    onClick={() => handlePageChange(i)}
                    aria-current={page === i ? 'page' : undefined}
                  >
                    {i + 1}
                  </button>
                );
              }
              if (i === page - 2 || i === page + 2) {
                return <span key={i} className="pagination-pill-ellipsis">…</span>;
              }
              return null;
            })}

            <button
              className="pagination-pill-arrow"
              onClick={() => handlePageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        <div className="pagination-size-wrapper">
          <label htmlFor="catalog-pagesize-select" className="text-xs text-secondary">Display:</label>
          <select
            id="catalog-pagesize-select"
            className="pagination-size-select"
            value={pageSize}
            onChange={(e) => {
              setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value));
              setPage(0);
            }}
            aria-label="Items per page"
          >
            <option value={12}>12 per page</option>
            <option value={24}>24 per page</option>
            <option value={48}>48 per page</option>
            <option value="all">View All ({sortedCatalog.length})</option>
          </select>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!archiveConfirm}
        title="Archive Product?"
        message={`Move ${archiveConfirm?.name} to the archive? All inventory variants and history will be preserved. You can restore it at any time.`}
        confirmText="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveConfirm(null)}
        isLoading={isArchiving}
      />

      {selectedProductForReviews && (
        <ProductReviewsModal 
          product={selectedProductForReviews}
          onClose={() => setSelectedProductForReviews(null)}
          onReviewsChanged={handleReviewsChanged}
        />
      )}
    </div>
  );
};

export default ClothingCatalog;
