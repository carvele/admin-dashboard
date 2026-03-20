import React, { useState, useEffect } from 'react';
import { Plus, X, Search, Tag, Trash2, Shirt, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { subscribeToCollection, addDocument, deleteDocument } from '../firebase/firestore';
import './OutfitSuggestions.css';

const OutfitSuggestions = () => {
  const [outfits, setOutfits] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [outfitName, setOutfitName] = useState('');
  const [occasionTag, setOccasionTag] = useState('Casual');
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [catalog, setCatalog] = useState([]);

  // Load saved outfits and catalog from Firestore
  useEffect(() => {
    const unsubOutfits = subscribeToCollection('outfits', (data) => {
      setOutfits(data);
    });
    
    const unsubCatalog = subscribeToCollection('products', (data) => {
      setCatalog(data);
    });
    
    return () => { unsubOutfits(); unsubCatalog(); };
  }, []);

  const filteredCatalog = catalog.filter(item => 
    (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const toggleItemSelection = (item) => {
    const isSelected = selectedItems.find(i => i.id === item.id);
    if (isSelected) {
      setSelectedItems(selectedItems.filter(i => i.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const handleCreateOutfit = async () => {
    if (!outfitName.trim()) { toast.error('Please enter an outfit name'); return; }
    if (selectedItems.length === 0) { toast.error('Please select at least one item'); return; }

    try {
      await addDocument('outfits', {
        name: outfitName,
        tag: occasionTag,
        items: selectedItems.map(item => ({
          id: item.docId,
          name: item.name,
          category: item.category,
          price: item.price,
          image: item.imageUrl || '👗'
        })),
      });
      toast.success('Outfit combination created!');
      setIsModalOpen(false);
      
      // Reset modal state
      setOutfitName('');
      setOccasionTag('Casual');
      setSelectedItems([]);
      setSearchTerm('');
    } catch (err) {
      toast.error('Failed to create outfit');
    }
  };

  const handleDelete = async (docId) => {
    try {
      await deleteDocument('outfits', docId);
      toast.success('Outfit deleted');
    } catch {
      toast.error('Failed to delete outfit');
    }
  };

  // Helper for rendering emoji vs real image
  const renderItemImage = (imageAsset) => {
    if (!imageAsset) return <Shirt size={16} />;
    if (imageAsset.startsWith('http')) {
      return <img src={imageAsset} alt="item" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />;
    }
    return imageAsset;
  };

  return (
    <div className="page-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Outfit Suggestions</h1>
          <p className="page-subtitle">Create and manage outfit combinations for customers</p>
        </div>
        <button className="btn-primary flex-center gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Create Outfit
        </button>
      </div>

      <div className="outfit-suggestions-grid mt-4">
        {outfits.length === 0 ? (
          <div className="card empty-state full-col">
            <Shirt size={48} className="text-secondary opacity-50 mb-3" />
            <h3>No Outfit Combinations</h3>
            <p className="text-secondary">Click "Create Outfit" to build your first suggestion.</p>
          </div>
        ) : (
          outfits.map(outfit => (
            <div key={outfit.id} className="card outfit-display-card">
              <div className="outfit-display-header">
                <div>
                  <h3 className="outfit-title">✧ {outfit.name}</h3>
                  <span className="outfit-tag">
                    <Tag size={12} /> {outfit.tag}
                  </span>
                </div>
                <button className="icon-btn-small text-danger" onClick={() => handleDelete(outfit.docId)}>
                   <X size={16} />
                </button>
              </div>
              
              <div className="outfit-display-items">
                <p className="items-count">Items ({outfit.items.length}):</p>
                <ul className="items-list">
                  {outfit.items.map(item => (
                    <li key={item.id}>
                      <span className="item-icon">
                        {renderItemImage(item.image)}
                      </span>
                      <div className="item-details">
                        <span className="item-name">{item.name}</span>
                        <span className="item-cat">{item.category}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg outfit-modal">
            <div className="modal-header">
              <h2>Create Outfit Combination</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-row mb-4">
                <div className="form-group flex-2">
                  <label className="label">Outfit Name</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="e.g., Evening Elegance" 
                    value={outfitName}
                    onChange={(e) => setOutfitName(e.target.value)}
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Occasion Tag</label>
                  <select 
                    className="input-field"
                    value={occasionTag}
                    onChange={(e) => setOccasionTag(e.target.value)}
                  >
                    <option>Casual</option>
                    <option>Formal</option>
                    <option>Work</option>
                    <option>Party</option>
                  </select>
                </div>
              </div>

              <div className="selected-items-area mb-4">
                <label className="label">Selected Items ({selectedItems.length})</label>
                <div className={`selected-items-box ${selectedItems.length === 0 ? 'empty' : ''}`}>
                  {selectedItems.length === 0 ? (
                    <p className="text-secondary text-sm text-center">Select clothing items below to create an outfit</p>
                  ) : (
                    <div className="selected-chips">
                      {selectedItems.map(item => (
                        <div key={item.id} className="selected-chip">
                          <span className="chip-icon">
                            {renderItemImage(item.image)}
                          </span>
                          <span className="chip-name">{item.name}</span>
                          <button className="chip-remove" onClick={() => toggleItemSelection(item)}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="available-items-area">
                <div className="flex-between align-center mb-2">
                  <label className="label m-0">Available Clothing Items</label>
                  <div className="search-box small-search">
                    <Search size={14} className="search-icon" />
                    <input 
                      type="text" 
                      placeholder="Search items..." 
                      className="input-field pl-8 input-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="available-items-grid">
                  {filteredCatalog.map(item => {
                    const isSelected = selectedItems.find(i => i.id === item.id);
                    return (
                      <div 
                        key={item.id} 
                        className={`available-item-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleItemSelection(item)}
                      >
                        <div className="avail-icon">
                          {renderItemImage(item.image)}
                        </div>
                        <div className="avail-details">
                          <span className="avail-name">{item.name}</span>
                          <span className="avail-cat">{item.category}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button 
                className="btn-primary" 
                onClick={handleCreateOutfit}
                disabled={!outfitName.trim() || selectedItems.length === 0}
              >
                + Create Outfit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutfitSuggestions;
