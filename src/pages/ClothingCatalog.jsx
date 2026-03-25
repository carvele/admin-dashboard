import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Tag as TagIcon, Edit, Trash2, Minus, Star } from 'lucide-react';
import { subscribeToCollection, updateDocument, deleteDocument } from '../firebase/firestore';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { deleteFile } from '../firebase/storage';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/permissions';
import ImageWithFallback from '../components/ImageWithFallback';
import './ClothingCatalog.css';

const ClothingCatalog = () => {
  const { isAdminUnlocked, user } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to products
    const unsubProducts = subscribeToCollection('products', (data) => {
      setCatalog(data);
      setLoading(false);
    });

    // Fetch dynamic categories once (could also subscribe if needed)
    const fetchCategories = async () => {
       try {
         const snap = await getDocs(collection(db, 'categories'));
         if (!snap.empty) {
           setDbCategories(snap.docs.map(d => d.data().name));
         } else {
           setDbCategories(['Outerwear', 'Tops', 'Bottoms', 'Dresses', 'Accessories']);
         }
       } catch (err) {
         setDbCategories(['Outerwear', 'Tops', 'Bottoms', 'Dresses', 'Accessories']);
       }
    };
    fetchCategories();

    return () => unsubProducts();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = ['All', ...dbCategories];
  const availableTags = ['New Arrival', 'Featured', 'AR Try-On'];

  const filteredCatalog = catalog.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchesCat = activeCategory === 'All' || item.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  // --- DELETE PRODUCT ---
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    const itemToDelete = deleteConfirm;
    try {
      await deleteDocument('products', itemToDelete.docId);
      
      // Delete primary image if real URL
      if (itemToDelete.imageUrl && itemToDelete.imageUrl.startsWith('http')) {
         await deleteFile(itemToDelete.imageUrl);
      }
      
      // Delete any gallery images
      if (itemToDelete.images && itemToDelete.images.length > 0) {
          for (const url of itemToDelete.images) {
              if (url && url.startsWith('http')) {
                  await deleteFile(url).catch(e => console.log('Silently ignoring gallery delete error', e));
              }
          }
      }

      // Delete linked inventory
      const snap = await getDocs(collection(db, 'inventory'));
      const toDelete = snap.docs.filter(d => {
        const inv = d.data();
        return inv.productDocId === itemToDelete.docId || 
               inv.sku === itemToDelete.id || 
               inv.id === itemToDelete.id ||
               inv.item === itemToDelete.name;
      });
      const deletePromises = toDelete.map(d => deleteDocument('inventory', d.id));
      await Promise.all(deletePromises);

      toast.success(`Deleted ${itemToDelete.name}`);
    } catch (e) {
      console.error('Delete product error:', e);
      toast.error('Failed to delete product: ' + e.message);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // --- INLINE STOCK +/- ---
  const updateStock = async (item, delta) => {
    const newStock = Math.max(0, item.stock + delta);
    try {
      await updateDocument('products', item.docId, { stock: newStock });
    } catch (e) {
      toast.error('Failed to update stock');
    }
  };

  // --- TOGGLE TAGS ---
  const toggleTag = async (item, tag) => {
    const currentTags = item.tags || [];
    const has = currentTags.includes(tag);
    const newTags = has ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
    try {
      await updateDocument('products', item.docId, { tags: newTags });
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
          <button className="btn-primary flex-center gap-2" onClick={() => navigate('/catalog/new')}>
            <Plus size={18} /> Add New Product
          </button>
        )}
      </div>

      <div className="catalog-toolbar card">
        <div className="cat-filters">
          {categories.map(cat => (
            <button key={cat} className={`cat-btn ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input type="text" placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input-field pl-10" />
        </div>
      </div>

      <div className="catalog-grid-display">
        {filteredCatalog.map(item => {
          // Check for gallery first, else fallback to imageUrl
          const displayUrl = (item.images && item.images.length > 0) ? item.images[0] : (item.image?.secure_url || item.imageUrl);
          const isRealImage = displayUrl && displayUrl.startsWith('http');
          
          return (
          <div key={item.id} className="product-card card">
            <div className="product-image-area">
              {isRealImage ? (
                <ImageWithFallback src={displayUrl} alt={item.name} className="product-real-image" fallbackSize={48} />
              ) : (
                <span className="dw-emoji view-xl">{displayUrl || '👗'}</span>
              )}
              {isAdminUnlocked && (
                <div className="product-actions-overlay">
                  <button className="icon-btn-light" title="Edit" onClick={() => navigate('/catalog/edit/' + item.docId)}><Edit size={16}/></button>
                  {can(user?.role, 'delete_catalog') && (
                    <button className="icon-btn-light danger" title="Delete" onClick={() => setDeleteConfirm(item)}><Trash2 size={16}/></button>
                  )}
                </div>
              )}
              {item.featured && (
                <div className="featured-badge"><Star size={10}/> Featured</div>
              )}
              {(item.tags || []).includes('AR Try-On') && (
                <div className="ar-badge">AR Ready</div>
              )}
            </div>

            <div className="product-info-area">
              <div className="flex-between align-start mb-2">
                <div>
                  <h3 className="product-name">{item.name}</h3>
                  <p className="product-category">{item.category}</p>
                </div>
                <div className="product-price">₱{(item.price || 0).toLocaleString()}</div>
              </div>

              {/* Inline Stock Control */}
              <div className="stock-inline-control mt-3">
                <button className="stock-btn" onClick={() => updateStock(item, -1)} disabled={item.stock <= 0}><Minus size={14}/></button>
                <span className="stock-count">{item.stock}</span>
                <button className="stock-btn" onClick={() => updateStock(item, 1)}><Plus size={14}/></button>
                <span className="text-secondary text-xs ml-2">in stock</span>
              </div>

              <div className="product-sizes mt-3">
                {(item.sizes || []).map(size => (
                  <span key={size} className="size-badge">{size}</span>
                ))}
              </div>

              {/* Clickable Tags */}
              <div className="product-tags mt-3">
                {availableTags.map(tag => (
                  <button
                    key={tag}
                    className={`catalog-tag-toggle ${(item.tags || []).includes(tag) ? 'active' : ''}`}
                    onClick={() => toggleTag(item, tag)}
                  >
                    <TagIcon size={12}/> {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
          );
        })}
        {loading ? (
          <div className="p-8 text-center text-secondary full-width">Loading catalog...</div>
        ) : filteredCatalog.length === 0 ? (
          <div className="empty-state flex-col flex-center gap-3 p-8" style={{width:'100%'}}>
            <div style={{opacity:0.3, marginBottom:'0.5rem'}}><TagIcon size={48} /></div>
            <h3 style={{fontSize:'1.1rem', fontWeight:600}}>Your Catalog Is Empty</h3>
            <p className="text-secondary text-center" style={{maxWidth:'360px', fontSize:'0.85rem'}}>Add your first product to start building your boutique catalog. Products will be available for reservations and inventory tracking.</p>
            {isAdminUnlocked && (
              <button className="btn-primary mt-3 flex-center gap-2" onClick={() => navigate('/catalog/new')}><Plus size={16}/> Add First Product</button>
            )}
          </div>
        ) : null}
      </div>

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 380, textAlign: 'center', padding: '2rem'}}>
            <div className="delete-icon-wrap"><Trash2 size={32} /></div>
            <h2>Delete Product?</h2>
            <p className="text-secondary mt-2">Remove <strong>{deleteConfirm.name}</strong> from the catalog? This cannot be undone.</p>
            <div className="modal-footer justify-center mt-4">
              <button className="btn-outline" onClick={() => setDeleteConfirm(null)} disabled={isDeleting}>Cancel</button>
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
