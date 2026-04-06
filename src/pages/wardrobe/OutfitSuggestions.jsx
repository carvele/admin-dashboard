import React, { useState, useEffect, useCallback, useRef } from 'react';
import debounce from 'lodash.debounce';
import {
  Plus, X, Search, Tag, Trash2, Shirt, ChevronRight, ChevronLeft,
  CheckCircle2, PackageOpen, Pencil, ImagePlus, Loader2, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  subscribeToCollection,
  addDocument,
  deleteDocument,
  updateDocument,
} from '../../firebase/firestore';
import { uploadToCloudinary } from '../../firebase/storage';
import { sanitizeText } from '../../utils/validation';
import './OutfitSuggestions.css';

const STEPS = ['Details', 'Pick Items', 'Review'];

const EMPTY_FORM = {
  outfitName: '',
  occasionTag: 'Casual',
  outfitDescription: '',
  outfitSeason: 'All-Season',
  outfitGender: 'Women',
  styleVibe: 'Chic',
  colorPalette: 'Pastels',
  selectedItems: [],
  imageFile: null,
  imagePreview: null,
  existingImageUrl: '',
};

const OutfitSuggestions = () => {
  const [outfits, setOutfits] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [editingOutfit, setEditingOutfit] = useState(null); // null = create mode
  const [isUploading, setIsUploading] = useState(false);

  // Form state
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fileInputRef = useRef(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useCallback(debounce((val) => setSearchTerm(val), 300), []);
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  const [catalog, setCatalog] = useState([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEffect(() => {
    const unsubOutfits = subscribeToCollection('suggestedOutfits', (data) => setOutfits(data));
    const unsubCatalog = subscribeToCollection('products', (data) => setCatalog(data));
    return () => { unsubOutfits(); unsubCatalog(); };
  }, []);

  const filteredCatalog = catalog.filter((item) =>
    (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const toggleItemSelection = (item) => {
    const isSelected = form.selectedItems.find((i) => i.id === item.id);
    if (isSelected) {
      setForm((f) => ({ ...f, selectedItems: f.selectedItems.filter((i) => i.id !== item.id) }));
    } else {
      setForm((f) => ({ ...f, selectedItems: [...f.selectedItems, item] }));
    }
  };

  const resetModal = () => {
    setForm({ ...EMPTY_FORM });
    setSearchInput('');
    setSearchTerm('');
    setStep(0);
    setEditingOutfit(null);
    setIsUploading(false);
  };

  const closeModal = () => { setIsModalOpen(false); resetModal(); };

  const openCreateModal = () => {
    resetModal();
    setIsModalOpen(true);
  };

  const openEditModal = (outfit) => {
    setEditingOutfit(outfit);
    setForm({
      outfitName: outfit.name || '',
      occasionTag: outfit.tag || 'Casual',
      outfitDescription: outfit.description || '',
      outfitSeason: outfit.season || 'All-Season',
      outfitGender: outfit.gender || 'Women',
      styleVibe: outfit.style || outfit.styleVibe || 'Chic',
      colorPalette: outfit.colorPalette || 'Pastels',
      selectedItems: (outfit.items || []).map((item) => ({
        id: item.id,
        docId: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        imageUrl: item.image,
        image: item.image,
      })),
      imageFile: null,
      imagePreview: outfit.imageUrl || null,
      existingImageUrl: outfit.imageUrl || '',
    });
    setSearchInput('');
    setSearchTerm('');
    setStep(0);
    setIsModalOpen(true);
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setForm((f) => ({ ...f, imageFile: file, imagePreview: preview }));
  };

  const clearImage = () => {
    setForm((f) => ({ ...f, imageFile: null, imagePreview: null, existingImageUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const canGoNext = () => {
    if (step === 0) return form.outfitName.trim().length > 0;
    if (step === 1) return form.selectedItems.length > 0;
    return true;
  };

  const buildPayload = async () => {
    let imageUrl = form.existingImageUrl;

    if (form.imageFile) {
      setIsUploading(true);
      try {
        const result = await uploadToCloudinary(form.imageFile);
        imageUrl = result.secure_url;
      } finally {
        setIsUploading(false);
      }
    }

    const totalPrice = form.selectedItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
    return {
      name: sanitizeText(form.outfitName),
      tag: sanitizeText(form.occasionTag),
      items: form.selectedItems.map((item) => ({
        id: item.docId || item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        image: item.imageUrl || item.image || '',
      })),
      description: sanitizeText(form.outfitDescription) || '',
      season: sanitizeText(form.outfitSeason),
      gender: sanitizeText(form.outfitGender),
      style: sanitizeText(form.styleVibe),       // Used by SuggestedOutfit.java model deserialization
      styleVibe: sanitizeText(form.styleVibe),   // Used by HomeActivity raw map (raw.get("styleVibe"))
      colorPalette: sanitizeText(form.colorPalette),
      price: totalPrice,                         // Used by SuggestedOutfit.java model (getPrice())
      totalPrice,                                // Used by HomeActivity raw map (raw.get("totalPrice"))
      imageUrl,
      isAvailable: true,
      active: true,                              // REQUIRED: HomeActivity queries .whereEqualTo("active", true)
    };
  };

  const handleSaveOutfit = async () => {
    try {
      const payload = await buildPayload();
      if (editingOutfit) {
        await updateDocument('suggestedOutfits', editingOutfit.docId, payload);
        toast.success('Outfit updated!');
      } else {
        await addDocument('suggestedOutfits', payload);
        toast.success('Outfit created!');
      }
      closeModal();
    } catch (err) {
      toast.error('Failed to save outfit');
      console.error(err);
    }
  };

  const handleDelete = async (docId) => {
    try {
      await deleteDocument('suggestedOutfits', docId);
      toast.success('Outfit deleted');
      setDeleteConfirmId(null);
    } catch {
      toast.error('Failed to delete outfit');
    }
  };

  const toggleOutfitActive = async (outfit) => {
    const newActive = !(outfit.isAvailable !== false);
    try {
      await updateDocument('suggestedOutfits', outfit.docId, { isAvailable: newActive });
      toast.success(newActive ? 'Outfit activated' : 'Outfit deactivated');
    } catch {
      toast.error('Failed to update outfit status');
    }
  };

  const renderItemImage = (imageAsset) => {
    if (!imageAsset) return <Shirt size={16} />;
    if (typeof imageAsset === 'string' && imageAsset.startsWith('http')) {
      return <img src={imageAsset} alt="item" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} />;
    }
    return imageAsset;
  };

  const totalPrice = form.selectedItems.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);
  const isEdit = !!editingOutfit;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">✦ Outfit Suggestions</h1>
          <p className="page-subtitle">Curate and manage stunning outfit combinations for your customers</p>
        </div>
        <button className="btn-primary flex-center gap-2" onClick={openCreateModal}>
          <Plus size={18} /> New Outfit
        </button>
      </div>

      {/* Summary Bar */}
      {outfits.length > 0 && (
        <div className="outfit-summary-bar">
          <div className="summary-stat">
            <span className="summary-num">{outfits.length}</span>
            <span className="summary-label">Total Outfits</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-stat">
            <span className="summary-num" style={{ color: '#e17fa0' }}>
              {outfits.filter((o) => o.isAvailable !== false).length}
            </span>
            <span className="summary-label">Active</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-stat">
            <span className="summary-num" style={{ color: 'var(--text-secondary)' }}>
              {outfits.filter((o) => o.isAvailable === false).length}
            </span>
            <span className="summary-label">Inactive</span>
          </div>
        </div>
      )}

      {/* Outfits Grid */}
      <div className="outfit-suggestions-grid">
        {outfits.length === 0 ? (
          <div className="card empty-state full-col">
            <PackageOpen size={48} style={{ opacity: 0.35, marginBottom: '1rem', color: '#e17fa0' }} />
            <h3>No Outfit Combinations Yet</h3>
            <p className="text-secondary" style={{ marginTop: '0.5rem' }}>
              Click <strong>"New Outfit"</strong> above to create your first suggestion.
            </p>
          </div>
        ) : (
          outfits.map((outfit) => (
            <div
              key={outfit.id}
              className={`card outfit-display-card ${outfit.isAvailable === false ? 'outfit-inactive' : ''}`}
            >
              {/* Outfit Image */}
              {outfit.imageUrl && (
                <div className="outfit-card-image">
                  <img src={outfit.imageUrl} alt={outfit.name} />
                </div>
              )}

              {/* Card Header */}
              <div className="outfit-card-top">
                <div className="outfit-card-meta">
                  <span className={`outfit-active-dot ${outfit.isAvailable !== false ? 'active' : ''}`} />
                  <span className="outfit-active-label">
                    {outfit.isAvailable !== false ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="outfit-card-actions">
                  <button
                    className="icon-btn-small text-rose"
                    title="Edit outfit"
                    onClick={() => openEditModal(outfit)}
                  >
                    <Pencil size={14} />
                  </button>
                  {deleteConfirmId === outfit.docId ? (
                    <div className="delete-confirm-inline">
                      <span style={{ fontSize: '0.72rem', color: '#dc2626' }}>Delete?</span>
                      <button className="confirm-del-btn" onClick={() => handleDelete(outfit.docId)}>Yes</button>
                      <button className="cancel-del-btn" onClick={() => setDeleteConfirmId(null)}>No</button>
                    </div>
                  ) : (
                    <button
                      className="icon-btn-small text-danger"
                      title="Delete outfit"
                      onClick={() => setDeleteConfirmId(outfit.docId)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Name & Tags */}
              <h3 className="outfit-title">✦ {outfit.name}</h3>
              <div className="outfit-tags-row">
                <span className="outfit-pill pill-occasion"><Tag size={10} /> {outfit.tag}</span>
                {outfit.season && <span className="outfit-pill pill-season">{outfit.season}</span>}
                {outfit.gender && <span className="outfit-pill pill-gender">{outfit.gender}</span>}
                {(outfit.style || outfit.styleVibe) && <span className="outfit-pill pill-vibe">{outfit.style || outfit.styleVibe}</span>}
                {outfit.colorPalette && <span className="outfit-pill pill-color">{outfit.colorPalette}</span>}
              </div>

              {outfit.description && (
                <p className="outfit-description">{outfit.description}</p>
              )}

              {/* Items */}
              <div className="outfit-items-section">
                <p className="items-count">Items ({outfit.items?.length ?? 0})</p>
                <ul className="items-list">
                  {(outfit.items || []).map((item) => (
                    <li key={item.id}>
                      <span className="item-icon">{renderItemImage(item.image)}</span>
                      <div className="item-details">
                        <span className="item-name">{item.name}</span>
                        <span className="item-cat">{item.category}</span>
                      </div>
                      {item.price > 0 && (
                        <span className="item-price">₱{parseFloat(item.price).toLocaleString()}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {(outfit.price > 0 || outfit.totalPrice > 0) && (
                  <p className="outfit-total-price">
                    Total: ₱{(outfit.price || outfit.totalPrice).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Toggle */}
              <div className="outfit-card-footer">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={outfit.isAvailable !== false}
                    onChange={() => toggleOutfitActive(outfit)}
                  />
                  <span className="toggle-slider" />
                </label>
                <span className="toggle-label">
                  {outfit.isAvailable !== false ? (
                    <><Eye size={12} style={{ display: 'inline', marginRight: 4 }} />Visible to customers</>
                  ) : (
                    <><EyeOff size={12} style={{ display: 'inline', marginRight: 4 }} />Hidden from customers</>
                  )}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── MODAL ── */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal-content modal-lg outfit-modal">

            {/* Header */}
            <div className="outfit-modal-header">
              <div>
                <h2>{isEdit ? '✦ Edit Outfit' : '✦ Create Outfit'}</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Step {step + 1} of {STEPS.length} — {STEPS[step]}
                </p>
              </div>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>

            {/* Step Progress */}
            <div className="step-progress-bar">
              {STEPS.map((label, i) => (
                <React.Fragment key={label}>
                  <div className={`step-node ${i < step ? 'done' : i === step ? 'active' : ''}`}>
                    {i < step ? <CheckCircle2 size={14} /> : <span>{i + 1}</span>}
                    <span className="step-label">{label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
                </React.Fragment>
              ))}
            </div>

            {/* ── STEP 0: Details ── */}
            {step === 0 && (
              <div className="modal-body">
                {/* Outfit Image Upload */}
                <div className="form-group">
                  <label className="label">Outfit Cover Image</label>
                  <div className="image-upload-zone" onClick={() => fileInputRef.current?.click()}>
                    {form.imagePreview ? (
                      <>
                        <img src={form.imagePreview} alt="preview" className="image-preview" />
                        <button
                          className="image-clear-btn"
                          type="button"
                          onClick={(e) => { e.stopPropagation(); clearImage(); }}
                        >
                          <X size={14} /> Remove
                        </button>
                      </>
                    ) : (
                      <div className="image-upload-placeholder">
                        <ImagePlus size={28} style={{ color: '#e17fa0', marginBottom: '0.5rem' }} />
                        <span>Click to upload outfit photo</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>JPG, PNG, WebP</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleImagePick}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group flex-2">
                    <label className="label">Outfit Name *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g., Blush Garden Brunch"
                      value={form.outfitName}
                      onChange={(e) => setForm((f) => ({ ...f, outfitName: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label className="label">Occasion</label>
                    <select className="input-field" value={form.occasionTag} onChange={(e) => setForm((f) => ({ ...f, occasionTag: e.target.value }))}>
                      <option>Casual</option>
                      <option>Formal</option>
                      <option>Work</option>
                      <option>Party</option>
                      <option>Date Night</option>
                      <option>Outdoor</option>
                      <option>Brunch</option>
                      <option>Resort Wear</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Style Description / Styling Tips</label>
                  <textarea
                    className="input-field"
                    rows="2"
                    placeholder="e.g., Perfect for garden parties, pairs beautifully with strappy heels..."
                    value={form.outfitDescription}
                    onChange={(e) => setForm((f) => ({ ...f, outfitDescription: e.target.value }))}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label className="label">Season</label>
                    <select className="input-field" value={form.outfitSeason} onChange={(e) => setForm((f) => ({ ...f, outfitSeason: e.target.value }))}>
                      <option>All-Season</option>
                      <option>Dry Season (Summer)</option>
                      <option>Wet Season (Rainy)</option>
                      <option>Cool Season (-Ber Months)</option>
                    </select>
                  </div>
                  <div className="form-group flex-1">
                    <label className="label">Gender</label>
                    <select className="input-field" value={form.outfitGender} onChange={(e) => setForm((f) => ({ ...f, outfitGender: e.target.value }))}>
                      <option>Women</option>
                      <option>Men</option>
                      <option>Unisex</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label className="label">Style Vibe</label>
                    <select className="input-field" value={form.styleVibe} onChange={(e) => setForm((f) => ({ ...f, styleVibe: e.target.value }))}>
                      <option>Chic</option>
                      <option>Minimalist</option>
                      <option>Romantic</option>
                      <option>Boho</option>
                      <option>Elegant</option>
                      <option>Vintage</option>
                      <option>Streetwear</option>
                      <option>Preppy</option>
                    </select>
                  </div>
                  <div className="form-group flex-1">
                    <label className="label">Color Palette</label>
                    <select className="input-field" value={form.colorPalette} onChange={(e) => setForm((f) => ({ ...f, colorPalette: e.target.value }))}>
                      <option>Pastels</option>
                      <option>Neutrals</option>
                      <option>Earth Tones</option>
                      <option>Monochrome</option>
                      <option>Vibrant</option>
                      <option>Dark &amp; Moody</option>
                      <option>Blush &amp; Rose</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 1: Pick Items ── */}
            {step === 1 && (
              <div className="modal-body">
                {/* Selected tray */}
                <div className="selected-items-area">
                  <label className="label">
                    Selected Items
                    <span className="selected-count-badge">{form.selectedItems.length}</span>
                  </label>
                  <div className={`selected-items-box ${form.selectedItems.length === 0 ? 'empty' : ''}`}>
                    {form.selectedItems.length === 0 ? (
                      <p className="text-secondary text-sm text-center">
                        Tap items below to add them to this outfit ✦
                      </p>
                    ) : (
                      <div className="selected-chips">
                        {form.selectedItems.map((item) => (
                          <div key={item.id} className="selected-chip">
                            <span className="chip-icon">{renderItemImage(item.imageUrl || item.image)}</span>
                            <span className="chip-name">{item.name}</span>
                            <button className="chip-remove" onClick={() => toggleItemSelection(item)}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {form.selectedItems.length > 0 && totalPrice > 0 && (
                    <p className="step1-total">
                      Running total: <strong>₱{totalPrice.toLocaleString()}</strong>
                    </p>
                  )}
                </div>

                {/* Catalog picker */}
                <div className="available-items-area">
                  <div className="flex-between align-center mb-2">
                    <label className="label m-0">
                      Catalog ({filteredCatalog.length} items)
                    </label>
                    <div className="search-box small-search">
                      <Search size={14} className="search-icon" />
                      <input
                        type="text"
                        placeholder="Search items..."
                        className="input-field pl-8 input-sm"
                        value={searchInput}
                        onChange={handleSearchChange}
                      />
                    </div>
                  </div>

                  <div className="available-items-grid">
                    {filteredCatalog.length === 0 ? (
                      <p className="text-secondary text-sm" style={{ gridColumn: '1/-1', padding: '1rem', textAlign: 'center' }}>
                        No items match your search.
                      </p>
                    ) : (
                      filteredCatalog.map((item) => {
                        const isSelected = !!form.selectedItems.find((i) => i.id === item.id);
                        return (
                          <div
                            key={item.id}
                            className={`available-item-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleItemSelection(item)}
                          >
                            <div className="avail-icon">
                              {renderItemImage(item.imageUrl || item.image)}
                            </div>
                            <div className="avail-details">
                              <span className="avail-name">{item.name}</span>
                              <span className="avail-cat">{item.category}</span>
                            </div>
                            {isSelected && (
                              <span className="avail-check"><CheckCircle2 size={14} /></span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: Review ── */}
            {step === 2 && (
              <div className="modal-body">
                {form.imagePreview && (
                  <div className="review-image-preview">
                    <img src={form.imagePreview} alt="outfit" />
                  </div>
                )}
                <div className="review-section">
                  <h4 className="review-section-title">Outfit Details</h4>
                  <div className="review-grid">
                    <div className="review-row"><span className="review-key">Name</span><span className="review-val">{form.outfitName}</span></div>
                    <div className="review-row"><span className="review-key">Occasion</span><span className="review-val">{form.occasionTag}</span></div>
                    <div className="review-row"><span className="review-key">Season</span><span className="review-val">{form.outfitSeason}</span></div>
                    <div className="review-row"><span className="review-key">Gender</span><span className="review-val">{form.outfitGender}</span></div>
                    <div className="review-row"><span className="review-key">Style Vibe</span><span className="review-val">{form.styleVibe}</span></div>
                    <div className="review-row"><span className="review-key">Color Palette</span><span className="review-val">{form.colorPalette}</span></div>
                    {form.outfitDescription && (
                      <div className="review-row full-width-row">
                        <span className="review-key">Description</span>
                        <span className="review-val">{form.outfitDescription}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="review-section">
                  <h4 className="review-section-title">
                    Selected Items ({form.selectedItems.length})
                    {totalPrice > 0 && (
                      <span className="review-total">₱{totalPrice.toLocaleString()} total</span>
                    )}
                  </h4>
                  <ul className="review-items-list">
                    {form.selectedItems.map((item) => (
                      <li key={item.id} className="review-item">
                        <span className="item-icon">{renderItemImage(item.imageUrl || item.image)}</span>
                        <div className="item-details">
                          <span className="item-name">{item.name}</span>
                          <span className="item-cat">{item.category}</span>
                        </div>
                        {item.price > 0 && (
                          <span className="item-price">₱{parseFloat(item.price).toLocaleString()}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Footer Navigation */}
            <div className="modal-footer outfit-modal-footer">
              <button className="btn-outline" onClick={step === 0 ? closeModal : () => setStep(step - 1)}>
                {step === 0 ? 'Cancel' : <><ChevronLeft size={16} /> Back</>}
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={() => setStep(step + 1)}
                  disabled={!canGoNext()}
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={handleSaveOutfit}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <><Loader2 size={16} className="spin-icon" /> Uploading...</>
                  ) : (
                    <><CheckCircle2 size={16} /> {isEdit ? 'Save Changes' : 'Create Outfit'}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutfitSuggestions;
