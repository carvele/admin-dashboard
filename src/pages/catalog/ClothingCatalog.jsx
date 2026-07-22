import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Tag as TagIcon, Edit, Archive, ArchiveRestore, Sparkles, Star, Box, Flame } from 'lucide-react';
import { getStockHealth } from '../../utils/stockStatus';
import ProductReviewsModal from './ProductReviewsModal';
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
  const [catalog, setCatalog] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
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
            if (!map[key]) map[key] = { available: 0, total: 0, reserved: 0 };
            map[key].available += Number(row.available || 0);
            map[key].total     += Number(row.total     || 0);
            map[key].reserved  += Number(row.reserved  || 0);
          });
        setInventoryMap(map);

        setCatalog(catalogWithReservations);
      } catch (err) {
        toast.error('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();

    // Fetch dynamic categories once (could also subscribe if needed)
    const fetchCategories = async () => {
      try {
        const cats = await getCategories();
        setDbCategories((cats || []).map((c) => c.name));
      } catch (err) {
        // No hardcoded fallback list — one would inevitably drift from the
        // real taxonomy (as the old one did). Degrade to "All" only; the
        // filter dropdown just won't offer per-category options until the
        // next successful load.
        Logger.error('Failed to load categories for filter dropdown', err);
        setDbCategories([]);
      }
    };
    fetchCategories();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [selectedProductForReviews, setSelectedProductForReviews] = useState(null);
  const [activeColor, setActiveColor] = useState('All Colors');
  const [viewMode, setViewMode] = useState('active'); // 'active' | 'archived'

  const categories = ['All', ...dbCategories];
  const availableTags = ['AR Try-On'];

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

    const matchesSearch = (item.name || '')
      .toLowerCase()
      .includes((searchTerm || '').toLowerCase());
    const matchesCat = activeCategory === 'All' || item.category === activeCategory;
    const matchesColor = activeColor === 'All Colors' || item.baseColor === activeColor;
    return matchesSearch && matchesCat && matchesColor;
  });

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
    } catch (e) {
      toast.error('Failed to update tags');
    }
  };

  // --- TOGGLE FEATURED ---
  const toggleFeature = async (item) => {
    try {
      await updateProduct(item.docId, { isFeatured: !item.isFeatured });
      setCatalog(catalog.map(c => c.docId === item.docId ? { ...c, isFeatured: !c.isFeatured } : c));
      toast.success(`Product ${!item.isFeatured ? 'featured' : 'unfeatured'}`);
    } catch (e) {
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
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Clothing Catalog</h1>
          <p className="page-subtitle">Manage products, variants, and gallery</p>
        </div>
        {isAdminUnlocked && (
          <button
            className="btn-primary flex-center gap-2"
            onClick={() => navigate('/catalog/new')}
          >
            <Plus size={18} /> Add New Product
          </button>
        )}
      </div>

      <div className="catalog-toolbar card">
        <div className="cat-filters">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`cat-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="catalog-toolbar-actions">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <div className="color-filter">
            <select
              className="input-field"
              value={activeColor}
              onChange={(e) => setActiveColor(e.target.value)}
            >
              <option value="All Colors">All Colors</option>
              {COLOR_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Active / Archived Segment Toggle */}
      {isAdminUnlocked && (
        <div className="archive-toggle-row">
          <button
            className={`archive-toggle-btn ${viewMode === 'active' ? 'active' : ''}`}
            onClick={() => setViewMode('active')}
          >
            Active ({catalog.filter(c => !c.deleted).length})
          </button>
          <button
            className={`archive-toggle-btn ${viewMode === 'archived' ? 'active' : ''}`}
            onClick={() => setViewMode('archived')}
          >
            <Archive size={14} /> Archived ({catalog.filter(c => c.deleted).length})
          </button>
        </div>
      )}

      <div className="catalog-grid-display">
        {filteredCatalog.map((item) => {
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
              onClick={() => navigate('/catalog/view/' + item.docId)}
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
                  <div className={`ar-badge ${item.model3DURL ? 'ready' : 'missing'}`}>
                    {item.model3DURL ? (
                      <span className="flex align-center gap-1"><Sparkles size={10} /> AR Ready</span>
                    ) : 'AR Missing'}
                  </div>
                )}

                {/* Quick AR Toggle */}
                <div className="ar-quick-toggle" style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  zIndex: 20
                }}>
                  <button
                    className="icon-btn-light"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTag(item, 'AR Try-On');
                    }}
                    title={(item.tags || []).includes('AR Try-On') ? "Disable AR Try-On" : "Enable AR Try-On"}
                    style={{ 
                      width: '32px', 
                      height: '32px',
                      backgroundColor: (item.tags || []).includes('AR Try-On') ? '#8B6F5C' : 'white',
                      color: (item.tags || []).includes('AR Try-On') ? 'white' : '#8B6F5C',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      cursor: 'pointer'
                    }}
                  >
                    <Box size={16} />
                  </button>
                </div>

                {item.onSale && (
                  <div className="sale-badge" style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    backgroundColor: '#ef4444',
                    color: 'white',
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
                <div className="flex-between align-start mb-2">
                  <div>
                    <h3 className="product-name">{item.name}</h3>
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
                  <div className="product-price-container" style={{ textAlign: 'right' }}>
                    {item.onSale ? (
                      <div className="sale-price-group">
                        <div className="original-price" style={{ 
                          fontSize: '0.85rem', 
                          textDecoration: 'line-through', 
                          color: '#94a3b8',
                          lineHeight: '1'
                        }}>
                          ₱{(item.price || 0).toLocaleString()}
                        </div>
                        <div className="sale-price" style={{ 
                          color: '#e11d48', 
                          fontWeight: '800',
                          fontSize: '1.25rem',
                          lineHeight: '1.2'
                        }}>
                          ₱{(item.salePrice || 0).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="product-price" style={{ fontWeight: '700', fontSize: '1.1rem' }}>
                        ₱{(item.price || 0).toLocaleString()}
                      </div>
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
                  {(item.sizes || []).map((size) => (
                    <span key={size} className="size-badge">
                      {size}
                    </span>
                  ))}
                </div>

                {/* Stock Health Badge */}
                {!item.deleted && (
                  <div className="flex align-center gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
                    <span className={`stock-tier-badge ${stockHealth.tier}`}>
                      {stockHealth.tier === 'critical' && <Flame size={9} />}
                      {stockHealth.label}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {invData ? invData.available : (item.stock ?? 0)} / {invData ? invData.total : 10} units
                    </span>
                  </div>
                )}

                {/* AR Tag Toggle & Featured Toggle */}
                <div className="product-tags mt-3">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      className={`catalog-tag-toggle ${(item.tags || []).includes(tag) ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleTag(item, tag); }}
                    >
                      <TagIcon size={12} /> {tag}
                    </button>
                  ))}
                  <button
                    className={`catalog-tag-toggle ${item.isFeatured ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleFeature(item); }}
                    style={{ 
                      borderColor: item.isFeatured ? '#ffd700' : 'transparent', 
                      color: item.isFeatured ? '#b8860b' : 'var(--text-secondary)',
                      backgroundColor: item.isFeatured ? '#fffcf0' : 'var(--bg-color)',
                      boxShadow: item.isFeatured ? '0 0 5px rgba(255, 215, 0, 0.3)' : 'none'
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
                          onClick={(e) => { e.stopPropagation(); navigate('/catalog/edit/' + item.docId); }}
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
          <div className="p-8 text-center text-secondary full-width">Loading catalog...</div>
        ) : filteredCatalog.length === 0 ? (
          <div className="empty-state flex-col flex-center gap-3 p-8" style={{ width: '100%' }}>
            <div style={{ opacity: 0.3, marginBottom: '0.5rem' }}>
              <TagIcon size={48} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Your Catalog Is Empty</h3>
            <p
              className="text-secondary text-center"
              style={{ maxWidth: '360px', fontSize: '0.85rem' }}
            >
              Add your first product to start building your boutique catalog. Products will be
              available for reservations and inventory tracking.
            </p>
            {isAdminUnlocked && (
              <button
                className="btn-primary mt-3 flex-center gap-2"
                onClick={() => navigate('/catalog/new')}
              >
                <Plus size={16} /> Add First Product
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Archive Confirm Modal */}
      {archiveConfirm && (
        <div className="modal-overlay" onClick={() => setArchiveConfirm(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 380, textAlign: 'center', padding: '2rem' }}
          >
            <div className="archive-icon-wrap">
              <Archive size={32} />
            </div>
            <h2>Archive Product?</h2>
            <p className="text-secondary mt-2">
              Move <strong>{archiveConfirm.name}</strong> to the archive? All inventory
              variants and history will be preserved. You can restore it at any time.
            </p>
            <div className="modal-footer justify-center mt-4">
              <button
                className="btn-outline"
                onClick={() => setArchiveConfirm(null)}
                disabled={isArchiving}
              >
                Cancel
              </button>
              <button className="btn-archive" onClick={handleArchive} disabled={isArchiving}>
                {isArchiving ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

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
