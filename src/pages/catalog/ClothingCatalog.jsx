import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Tag as TagIcon, Edit, Trash2, Sparkles } from 'lucide-react';
import {
  getProducts,
  updateProduct,
  deleteProduct,
  getCategories,
  getInventory,
  deleteInventoryItem,
} from '../../services/productService';
import { deleteFile } from '../../firebase/storage';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import ImageWithFallback from '../../components/ImageWithFallback';
import './ClothingCatalog.css';

const ClothingCatalog = () => {
  const { isAdminUnlocked, user } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch products (now cached)
    const fetchProducts = async () => {
      try {
        const data = await getProducts();
        setCatalog(data);
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
        if (cats && cats.length > 0) {
          setDbCategories(cats.map((c) => c.name));
        } else {
          setDbCategories(['Tops', 'Dress', 'Bags', 'Bottoms', 'Footwear']);
        }
      } catch (err) {
        setDbCategories(['Tops', 'Dress', 'Bags', 'Bottoms', 'Footwear']);
      }
    };
    fetchCategories();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = ['All', ...dbCategories];
  const availableTags = ['AR Try-On'];

  // Auto-expire New Arrival after 7 days
  const isNewArrival = (item) => {
    if (!item.timestamp) return false;
    const created = typeof item.timestamp === 'number' ? item.timestamp : Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - created < sevenDays;
  };

  const filteredCatalog = catalog.filter((item) => {
    const matchesSearch = (item.name || '')
      .toLowerCase()
      .includes((searchTerm || '').toLowerCase());
    const matchesCat = activeCategory === 'All' || item.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  // --- DELETE PRODUCT ---
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    const itemToDelete = deleteConfirm;
    try {
      Logger.info(`Deleting product ${itemToDelete.docId} (${itemToDelete.name})...`);

      // 1. Delete Firestore Document
      await deleteProduct(itemToDelete.docId);

      // 2. Cleanup Images (Only Firebase Storage, ignore Cloudinary/External)
      const isFirebaseUrl = (url) => url && url.includes('firebasestorage.googleapis.com');

      const allImageUrls = [itemToDelete.imageUrl, ...(itemToDelete.images || [])].filter(
        (url) => url && typeof url === 'string',
      );

      for (const url of allImageUrls) {
        if (isFirebaseUrl(url)) {
          Logger.info(`Deleting Firebase asset: ${url}`);
          await deleteFile(url).catch((e) =>
            Logger.warn(`Failed to delete storage file: ${url}`, e),
          );
        } else if (url.includes('cloudinary.com')) {
          Logger.info(
            `Skipping Cloudinary asset delete (must be handled via Cloud Function): ${url}`,
          );
        }
      }

      // 3. Delete linked inventory
      Logger.info(`Cleaning up inventory for ${itemToDelete.docId}...`);
      const invDocs = await getInventory();
      const toDelete = invDocs.filter((inv) => {
        return (
          inv.productDocId === itemToDelete.docId ||
          inv.sku === itemToDelete.id ||
          inv.id === itemToDelete.id
        );
      });

      if (toDelete.length > 0) {
        const deletePromises = toDelete.map((d) => deleteInventoryItem(d.docId));
        await Promise.all(deletePromises);
        console.log(`Deleted ${toDelete.length} inventory items.`);
      }

      toast.success(`Product "${itemToDelete.name}" deleted successfully`);
    } catch (e) {
      Logger.error('Delete product error:', e);
      toast.error('Failed to delete product: ' + e.message);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // --- TOGGLE TAGS ---
  const toggleTag = async (item, tag) => {
    const currentTags = item.tags || [];
    const has = currentTags.includes(tag);
    const newTags = has ? currentTags.filter((t) => t !== tag) : [...currentTags, tag];
    try {
      await updateProduct(item.docId, { tags: newTags });
    } catch (e) {
      toast.error('Failed to update tags');
    }
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
      </div>

      <div className="catalog-grid-display">
        {filteredCatalog.map((item) => {
          // Check for gallery first, else fallback to imageUrl
          const displayUrl =
            item.images && item.images.length > 0
              ? item.images[0]
              : item.image?.secure_url || item.imageUrl;
          const isRealImage = displayUrl && displayUrl.startsWith('http');

          return (
            <div key={item.id} className="product-card card">
              <div className="product-image-area">
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
                {(item.tags || []).includes('AR Try-On') && (
                  <div className="ar-badge">AR Ready</div>
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
                  <div className="product-price">₱{(item.price || 0).toLocaleString()}</div>
                </div>

                <div className="product-sizes mt-3">
                  {(item.sizes || []).map((size) => (
                    <span key={size} className="size-badge">
                      {size}
                    </span>
                  ))}
                </div>

                {/* AR Tag Toggle */}
                <div className="product-tags mt-3">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      className={`catalog-tag-toggle ${(item.tags || []).includes(tag) ? 'active' : ''}`}
                      onClick={() => toggleTag(item, tag)}
                    >
                      <TagIcon size={12} /> {tag}
                    </button>
                  ))}
                </div>

                {/* CRUD Actions */}
                {isAdminUnlocked && (
                  <div className="product-card-actions mt-3">
                    <button
                      className="btn-outline btn-sm flex-center gap-1"
                      onClick={() => navigate('/catalog/edit/' + item.docId)}
                    >
                      <Edit size={14} /> Edit
                    </button>
                    {can(user?.role, 'delete_catalog') && (
                      <button
                        className="btn-outline btn-sm btn-danger-outline flex-center gap-1"
                        onClick={() => setDeleteConfirm(item)}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
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

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 380, textAlign: 'center', padding: '2rem' }}
          >
            <div className="delete-icon-wrap">
              <Trash2 size={32} />
            </div>
            <h2>Delete Product?</h2>
            <p className="text-secondary mt-2">
              Remove <strong>{deleteConfirm.name}</strong> from the catalog? This cannot be undone.
            </p>
            <div className="modal-footer justify-center mt-4">
              <button
                className="btn-outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClothingCatalog;
