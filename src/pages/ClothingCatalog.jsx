import React, { useState } from 'react';
import { Search, Filter, Plus, Edit2, TrendingDown, Package, Database } from 'lucide-react';
import { subscribeToCollection, addDocument, updateDocument } from '../firebase/firestore';
import StatusBadge from '../components/StatusBadge';
import './ClothingCatalog.css';

const ClothingCatalog = () => {
  const [inventory, setInventory] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState(null);

  React.useEffect(() => {
    const unsub = subscribeToCollection('inventory', (data) => {
      setInventory(data);
    });
    return () => unsub();
  }, []);

  const filteredInventory = inventory.filter(item => 
    item.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      item: formData.get('item'),
      category: formData.get('category'),
      size: formData.get('size'),
      available: parseInt(formData.get('available')),
      total: parseInt(formData.get('total')),
      status: parseInt(formData.get('available')) > 0 ? 'In Stock' : 'Out of Stock'
    };

    if (editingItem) {
      await updateDocument('inventory', editingItem.id, data);
    } else {
      await addDocument('inventory', data);
    }
    
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="catalog-layout">
      <div className="page-header">
        <h1 className="page-title">Clothing Catalog</h1>
        <p className="page-subtitle">Manage store inventory, stock levels, and product variations</p>
      </div>

      <div className="catalog-actions">
        <div className="search-and-filter">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search by product name or SKU..." 
              className="input-field pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="icon-btn"><Filter size={20} /></button>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus size={20} /> Add New Product
        </button>
      </div>

      <div className="inventory-grid">
        {filteredInventory.map(item => {
          const stockPercent = (item.available / item.total) * 100;
          return (
            <div key={item.id} className="inventory-card card">
              <div className="card-img-placeholder">
                <Package size={48} strokeWidth={1.5} />
                <div className="card-status-badge">
                  <StatusBadge status={item.status} />
                </div>
              </div>
              <div className="inventory-details">
                <span className="item-sku">SKU: {item.id.slice(0, 8).toUpperCase()}</span>
                <h3 className="item-title">{item.item}</h3>
                
                <div className="stock-info">
                  <span className="stock-label">Size {item.size} Availability</span>
                  <span className={`stock-value ${stockPercent < 20 ? 'low' : 'healthy'}`}>
                    {item.available} / {item.total}
                  </span>
                </div>
                
                <div className="stock-bar-container">
                  <div 
                    className="stock-bar-fill" 
                    style={{ 
                      width: `${stockPercent}%`,
                      backgroundColor: stockPercent < 20 ? '#DC2626' : 'var(--accent)'
                    }}
                  ></div>
                </div>

                <div className="card-actions">
                  <button className="btn-outline flex items-center justify-center gap-2" onClick={() => {
                    setEditingItem(item);
                    setIsModalOpen(true);
                  }}>
                    <Edit2 size={16} /> Edit
                  </button>
                  <button className="btn-outline flex items-center justify-center gap-2">
                    <Database size={16} /> History
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="text-xl font-semibold mb-6">{editingItem ? 'Edit Product' : 'Add New Product'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Product Name</label>
                <input name="item" defaultValue={editingItem?.item} className="input-field" placeholder="e.g. Linen Blend Shirt" required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select name="category" defaultValue={editingItem?.category} className="input-field">
                    <option>Tops</option><option>Bottoms</option><option>Dresses</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Size</label>
                  <input name="size" defaultValue={editingItem?.size} className="input-field" placeholder="L / 32 / Large" required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Available Stock</label>
                  <input name="available" type="number" defaultValue={editingItem?.available} className="input-field" required />
                </div>
                <div className="form-group">
                  <label>Total Capacity</label>
                  <input name="total" type="number" defaultValue={editingItem?.total} className="input-field" required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => {
                  setIsModalOpen(false);
                  setEditingItem(null);
                }}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClothingCatalog;
