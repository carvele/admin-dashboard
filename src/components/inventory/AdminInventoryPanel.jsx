import { useEffect, useState, useMemo, useRef } from 'react';
import { Upload, Settings2, Palette, FolderTree, Search, Check, ChevronDown } from 'lucide-react';
import {
  addColor,
  addPattern,
  deleteColor,
  deletePattern,
  getColorList,
  getPatternList,
  updateColor,
  updatePattern,
  updateStockBaseline,
} from '../../services/inventoryService';
import {
  addCategoryAdmin,
  deleteCategoryAdmin,
  getCategories,
  renameCategoryAdmin,
  updateCategory,
} from '../../services/productService';
import { uploadToCloudinary } from '../../lib/storage';
import ConfirmDialog from '../ConfirmDialog';
import './AdminInventoryPanel.css';

// ── Inline error dialog (replaces window.alert for deletion errors) ──────────
const ErrorDialog = ({ message, onClose }) => (
  <div
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="err-dialog-title"
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    }}
  >
    <div
      style={{
        background: 'var(--white)',
        borderRadius: 'var(--spacing-md)',
        padding: '2rem',
        maxWidth: '420px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        border: '1px solid var(--border-color)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'var(--status-cancelled-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '1.1rem', color: 'var(--status-cancelled-text)' }}>✕</span>
        </div>
        <h4
          id="err-dialog-title"
          style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--charcoal)' }}
        >
          Cannot Delete
        </h4>
      </div>
      <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--charcoal)', lineHeight: 1.6 }}>
        {message}
      </p>
      <button
        className="btn-primary"
        style={{ width: '100%' }}
        onClick={onClose}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- primary action of a just-opened alertdialog
        autoFocus
      >
        OK, Got It
      </button>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
// Safe thumbnail with fallback for broken or 404 images
const ThumbnailWithFallback = ({ src }) => {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return <div title="No image set" className="aip-thumb-empty" />;
  }
  return (
    <img
      src={src}
      alt=""
      className="aip-thumb"
      onError={() => setHasError(true)}
    />
  );
};

export default function AdminInventoryPanel({ products, onClose, onProductUpdated }) {
  const [colors, setColors] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]); // [{id, name, subcategories:[]}]
  const [productId, setProductId] = useState('');
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const [dialogMsg, setDialogMsg] = useState(''); // for deletion-blocked dialog
  const [deleteConfirmState, setDeleteConfirmState] = useState(null);

  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [baselineSuccess, setBaselineSuccess] = useState('');

  // Sub-category add form state
  const [newSubName, setNewSubName] = useState('');
  const [newSubParentId, setNewSubParentId] = useState('');
  const [subParentFilter, setSubParentFilter] = useState('all');

  // Category image upload — id of the category currently mid-upload, or null
  const [uploadingCatId, setUploadingCatId] = useState(null);

  const load = async () => {
    try {
      const [c, p, cats] = await Promise.all([
        getColorList(),
        getPatternList(),
        getCategories(),
      ]);
      setColors(c);
      setPatterns(p);
      setCategoryTree(cats);
      setError('');
    } catch {
      setError('Unable to load lookup lists.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const product = products.find((p) => p.id === productId);

  // Filter products by name, style_code, or sku for combobox
  const filteredProducts = useMemo(() => {
    const q = (productSearchQuery || '').trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = (p.name || '').toLowerCase();
      const style = (p.style_code || p.styleCode || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      return name.includes(q) || style.includes(q) || sku.includes(q);
    });
  }, [products, productSearchQuery]);

  const comboboxRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target)) {
        setIsProductPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (selectedProd) => {
    if (!selectedProd) return;
    setProductId(selectedProd.id);
    setProductSearchQuery(selectedProd.name || '');
    setIsProductPickerOpen(false);
    setHighlightedIndex(-1);
    setBaselineSuccess('');

    // Current baseline reflection (preserves 0 cleanly)
    const currentBaseline =
      selectedProd.stockbaseline ?? selectedProd.stockBaseline ?? selectedProd.baseline ?? '';
    setBaseline(currentBaseline !== '' && currentBaseline !== null && currentBaseline !== undefined ? String(currentBaseline) : '');
  };

  const handleComboboxKeyDown = (e) => {
    if (!isProductPickerOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsProductPickerOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredProducts.length) {
        handleSelectProduct(filteredProducts[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsProductPickerOpen(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const n = Number(baseline);
    if (!product || !Number.isInteger(n) || n < 0) {
      setError('Enter a non-negative whole number.');
      setBaselineSuccess('');
      return;
    }
    try {
      await updateStockBaseline(product.id, n);
      setError('');
      setBaselineSuccess(`Baseline updated to ${n} for "${product.name}".`);
      await onProductUpdated();
    } catch (err) {
      setError(err.message);
      setBaselineSuccess('');
    }
  };

  // ── Generic lookup list renderer (Colors / Patterns) ──────────────────────
  const list = (title, items, add, update, remove) => {
    const singular = title.toLowerCase().slice(0, -1);
    const inputId = `aip-add-${singular}`;
    return (
      <div className="aip-field">
        <span className="aip-col-title">{title}</span>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const n = e.target.name.value.trim();
            if (n) {
              try {
                await add(n);
                e.target.reset();
                load();
              } catch (err) {
                setError(err.message);
              }
            }
          }}
          className="aip-add-form"
        >
          <input autoComplete="off"
            id={inputId}
            name="name"
            className="input-field"
            placeholder={`Add new ${singular}...`}
            aria-label={`New ${singular}`}
          />
          <button className="btn-primary">Add</button>
        </form>
        <ul className="aip-list">
          {items.length === 0 ? (
            <li className="aip-empty">No {title.toLowerCase()} configured</li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="aip-item">
                <input autoComplete="off" id="field_lku8lyj" name="field_lku8lyj"
                  defaultValue={item.name}
                  className="input-field aip-item-name"
                  aria-label={`${singular} name`}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== item.name) {
                      update(item.id, val).then(load).catch((err) => setError(err.message));
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-outline aip-delete"
                  onClick={() => {
                    setDeleteConfirmState({
                      title: `Delete ${singular}`,
                      message: `Delete ${item.name}? This will remove it from available options.`,
                      onConfirm: () => remove(item.id).then(load).catch((err) => setError(err.message)),
                    });
                  }}
                  aria-label={`Delete ${singular} ${item.name}`}
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    );
  };

  // ── Categories section ─────────────────────────────────────────────────────
  const handleAddTopCategory = async (e) => {
    e.preventDefault();
    const name = e.target.catName.value.trim();
    if (!name) return;
    try {
      await addCategoryAdmin(name, null);
      e.target.reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddSubCategory = async (e) => {
    e.preventDefault();
    if (!newSubName.trim() || !newSubParentId) {
      setError('Choose a parent category and enter a subcategory name.');
      return;
    }
    try {
      await addCategoryAdmin(newSubName.trim(), newSubParentId);
      setNewSubName('');
      setNewSubParentId('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRenameCategory = (id, oldName, newName) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    renameCategoryAdmin(id, newName.trim()).then(load).catch((err) => setError(err.message));
  };

  const handleDeleteCategory = async (id, name, isSubcategory) => {
    try {
      await deleteCategoryAdmin(id, name, isSubcategory);
      load();
    } catch (err) {
      // Show friendly modal dialog instead of alert/throwing to console
      setDialogMsg(err.message);
    }
  };

  const handleCategoryImageUpload = async (catId, file) => {
    if (!file) return;
    setUploadingCatId(catId);
    try {
      const { secure_url } = await uploadToCloudinary(file);
      await updateCategory(catId, { imageUrl: secure_url });
      await load();
    } catch (err) {
      setError(err.message || 'Failed to upload category image.');
    } finally {
      setUploadingCatId(null);
    }
  };

  // Thumbnail + upload button shown next to a category/subcategory's name.
  // Shared by the top-level list and the subcategory list below.
  const renderImageControl = (cat) => (
    <div className="aip-thumb-wrap">
      <ThumbnailWithFallback src={cat.imageUrl} />
      <label title="Upload image" className="aip-upload">
        <Upload size={14} />
        <span className="aip-sr-only">Upload image for {cat.name}</span>
        <input autoComplete="off" id="field_s4hcmz8" name="field_s4hcmz8"
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleCategoryImageUpload(cat.id, e.target.files[0])}
        />
      </label>
      {uploadingCatId === cat.id && (
        <div className="aip-upload-busy">
          <div className="loading-spinner" style={{ width: 14, height: 14 }} />
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Deletion-blocked error dialog */}
      {dialogMsg && <ErrorDialog message={dialogMsg} onClose={() => setDialogMsg('')} />}

      <div className="card page-animate aip-panel">
        <div className="card-header aip-header">
          <h3 className="page-title">Inventory Administration</h3>
          <button className="btn-secondary small" onClick={onClose}>Close Panel</button>
        </div>

        {error && (
          <div role="alert" className="aip-error">
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              className="aip-error-dismiss"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        <div className="aip-sections">
          {/* ── Section 1: Stock Baseline ── */}
          <section className="aip-section">
            <div className="aip-section-head">
              <div className="aip-section-icon"><Settings2 size={18} /></div>
              <div>
                <h4 className="aip-section-title">Stock Baseline Settings</h4>
                <p className="aip-section-subtitle">
                  The reorder threshold a product is measured against when flagging low stock.
                </p>
              </div>
            </div>

            {baselineSuccess && (
              <div className="aip-baseline-success" role="status">
                <Check size={16} />
                <span>{baselineSuccess}</span>
              </div>
            )}

            <form onSubmit={save} className="aip-baseline-row">
              <div className="aip-field aip-combobox-container" ref={comboboxRef}>
                <label className="label" htmlFor="baseline-product-search">
                  Select Product
                </label>
                <div className="aip-combobox-input-wrap">
                  <Search size={16} className="aip-combobox-search-icon" aria-hidden="true" />
                  <input
                    id="baseline-product-search"
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isProductPickerOpen}
                    aria-controls="baseline-product-listbox"
                    aria-activedescendant={
                      highlightedIndex >= 0 && filteredProducts[highlightedIndex]
                        ? `baseline-product-opt-${filteredProducts[highlightedIndex].id}`
                        : undefined
                    }
                    className="input-field aip-combobox-input"
                    placeholder="Search product name, style code, SKU..."
                    value={productSearchQuery}
                    onChange={(e) => {
                      setProductSearchQuery(e.target.value);
                      setIsProductPickerOpen(true);
                      setHighlightedIndex(-1);
                    }}
                    onFocus={() => setIsProductPickerOpen(true)}
                    onKeyDown={handleComboboxKeyDown}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="aip-combobox-toggle-btn"
                    onClick={() => setIsProductPickerOpen((prev) => !prev)}
                    aria-label="Toggle product list"
                    tabIndex={-1}
                  >
                    <ChevronDown
                      size={16}
                      className={`aip-combobox-chevron ${isProductPickerOpen ? 'open' : ''}`}
                    />
                  </button>
                </div>

                {isProductPickerOpen && (
                  <ul
                    id="baseline-product-listbox"
                    role="listbox"
                    aria-label="Products"
                    className="aip-combobox-listbox"
                  >
                    {filteredProducts.length === 0 ? (
                      <li className="aip-combobox-empty" role="presentation">
                        No matching products found
                      </li>
                    ) : (
                      filteredProducts.map((p, idx) => {
                        const isSelected = p.id === productId;
                        const isHighlighted = idx === highlightedIndex;
                        const pBaseline =
                          p.stockbaseline ?? p.stockBaseline ?? p.baseline ?? null;

                        return (
                          <li
                            key={p.id}
                            id={`baseline-product-opt-${p.id}`}
                            role="option"
                            aria-selected={isSelected}
                            className={`aip-combobox-option ${isSelected ? 'selected' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                            onClick={() => handleSelectProduct(p)}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                          >
                            <div className="aip-combobox-option-info">
                              <span className="aip-combobox-option-name">{p.name}</span>
                              <div className="aip-combobox-option-meta">
                                {p.category && (
                                  <span className="aip-combobox-meta-tag">{p.category}</span>
                                )}
                                {(p.style_code || p.styleCode) && (
                                  <span className="aip-combobox-meta-sku">
                                    Style: {p.style_code || p.styleCode}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="aip-combobox-option-baseline">
                              <span className="aip-combobox-baseline-label">Baseline:</span>
                              <span className="aip-combobox-baseline-val">
                                {pBaseline !== null && pBaseline !== undefined ? pBaseline : 'Not set'}
                              </span>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                )}
                {product && (
                  <div className="aip-product-selected-info">
                    <span className="aip-product-selected-badge">Selected:</span>
                    <span className="aip-product-selected-name">{product.name}</span>
                    <span className="aip-product-selected-baseline">
                      (Current baseline:{' '}
                      <strong>
                        {product.stockbaseline ?? product.stockBaseline ?? product.baseline ?? 'None'}
                      </strong>
                      )
                    </span>
                  </div>
                )}
              </div>
              <div className="aip-field">
                <label className="label" htmlFor="baseline-qty-input">Baseline Quantity</label>
                <input autoComplete="off"
                  id="baseline-qty-input"
                  type="number"
                  min="0"
                  step="1"
                  className="input-field"
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
              <button className="btn-primary aip-save-btn">Save Baseline</button>
            </form>
          </section>

          {/* ── Section 2: Master Attributes ── */}
          <section className="aip-section">
            <div className="aip-section-head">
              <div className="aip-section-icon"><Palette size={18} /></div>
              <div>
                <h4 className="aip-section-title">Master Attributes</h4>
                <p className="aip-section-subtitle">
                  Colours and patterns available when creating a product. Renaming one updates it everywhere.
                </p>
              </div>
            </div>

            <div className="aip-grid-2">
              {list('Colors', colors, addColor, updateColor, deleteColor)}
              {list('Patterns', patterns, addPattern, updatePattern, deletePattern)}
            </div>
          </section>

          {/* ── Section 3: Taxonomy ── */}
          <section className="aip-section">
            <div className="aip-section-head">
              <div className="aip-section-icon"><FolderTree size={18} /></div>
              <div>
                <h4 className="aip-section-title">Taxonomy</h4>
                <p className="aip-section-subtitle">
                  Categories and sub-categories, with the images shown to customers in the mobile app.
                </p>
              </div>
            </div>

            <div className="aip-grid-2 aip-taxonomy-grid">
              {/* Left: Top-Level Categories */}
              <div className="aip-field aip-taxonomy-pane">
                <div className="aip-pane-header">
                  <div className="aip-pane-title-wrap">
                    <span className="aip-col-title">Top-Level Categories</span>
                    <span className="aip-count-badge">{categoryTree.length} categories</span>
                  </div>
                </div>

                <form onSubmit={handleAddTopCategory} className="aip-add-form">
                  <input autoComplete="off"
                    name="catName"
                    className="input-field"
                    placeholder="e.g. Gowns"
                    aria-label="New top-level category name"
                  />
                  <button className="btn-primary">Add</button>
                </form>

                <ul className="aip-list aip-custom-scrollbar">
                  {categoryTree.length === 0 ? (
                    <li className="aip-empty aip-empty-card">
                      <FolderTree size={24} className="aip-empty-icon" />
                      <p className="aip-empty-title">No categories yet</p>
                      <p className="aip-empty-subtitle">Use the input above to create your first category.</p>
                    </li>
                  ) : (
                    categoryTree.map((cat) => (
                      <li key={cat.id} className="aip-item">
                        {renderImageControl(cat)}
                        <input autoComplete="off" id={`field_${cat.id}`} name={`field_${cat.id}`}
                          defaultValue={cat.name}
                          className="input-field aip-item-name aip-item-name-bold"
                          aria-label="Category name"
                          onBlur={(e) => handleRenameCategory(cat.id, cat.name, e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-outline aip-delete"
                          onClick={() => handleDeleteCategory(cat.id, cat.name, false)}
                          aria-label={`Delete category ${cat.name}`}
                        >
                          Delete
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {/* Right: Sub-Categories */}
              <div className="aip-field aip-taxonomy-pane">
                <div className="aip-pane-header">
                  <div className="aip-pane-title-wrap">
                    <span className="aip-col-title">Sub-Categories</span>
                    <span className="aip-count-badge">
                      {subParentFilter === 'all'
                        ? `${categoryTree.reduce((acc, c) => acc + c.subcategories.length, 0)} total`
                        : `${categoryTree.find((c) => c.id === subParentFilter)?.subcategories.length || 0} items`}
                    </span>
                  </div>
                </div>

                {/* Sub-Categories Toolbar Row */}
                <div className="aip-subcat-toolbar-row">
                  <div className="aip-filter-control">
                    <select autoComplete="off"
                      id="subcat-parent-filter"
                      className="input-field aip-select-filter"
                      value={subParentFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSubParentFilter(val);
                        if (val !== 'all') setNewSubParentId(val);
                      }}
                      aria-label="Filter sub-categories by parent category"
                    >
                      <option value="all">All Categories ({categoryTree.reduce((acc, c) => acc + c.subcategories.length, 0)})</option>
                      {categoryTree.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} ({cat.subcategories.length})
                        </option>
                      ))}
                    </select>
                  </div>

                  <form onSubmit={handleAddSubCategory} className="aip-subcat-quick-add">
                    {subParentFilter === 'all' ? (
                      <select autoComplete="off" id="field_mmntiqy" name="field_mmntiqy"
                        className="input-field aip-select-parent-compact"
                        value={newSubParentId}
                        onChange={(e) => {
                          setNewSubParentId(e.target.value);
                          if (e.target.value) setSubParentFilter(e.target.value);
                        }}
                        aria-label="Select parent category"
                      >
                        <option value="">Parent...</option>
                        {categoryTree.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    ) : (
                      <select autoComplete="off" id="field_mmntiqy" name="field_mmntiqy"
                        value={newSubParentId}
                        onChange={(e) => setNewSubParentId(e.target.value)}
                        aria-label="Select parent category"
                        className="aip-sr-only"
                      >
                        {categoryTree.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    )}
                    <input autoComplete="off" id="field_pri0jpv" name="field_pri0jpv"
                      className="input-field"
                      placeholder={
                        subParentFilter !== 'all'
                          ? `Add to ${categoryTree.find((c) => c.id === subParentFilter)?.name || 'category'}...`
                          : 'Sub-category name...'
                      }
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      aria-label="New sub-category name"
                    />
                    <button className="btn-primary">Add</button>
                  </form>
                </div>

                {/* Subcategories list – filtered by chosen parent or grouped all */}
                <ul className="aip-list aip-custom-scrollbar">
                  {(subParentFilter === 'all' ? categoryTree : categoryTree.filter((c) => c.id === subParentFilter))
                    .every((c) => c.subcategories.length === 0) ? (
                    <li className="aip-empty aip-empty-card">
                      <FolderTree size={24} className="aip-empty-icon" />
                      <p className="aip-empty-title">
                        {subParentFilter === 'all'
                          ? 'No sub-categories yet'
                          : `No sub-categories in ${categoryTree.find((c) => c.id === subParentFilter)?.name || 'this category'}`}
                      </p>
                      <p className="aip-empty-subtitle">Use the input above to add a sub-category.</p>
                    </li>
                  ) : (
                    (subParentFilter === 'all' ? categoryTree : categoryTree.filter((c) => c.id === subParentFilter))
                      .flatMap((cat) =>
                        cat.subcategories.length === 0 ? [] : [
                          <li key={`hdr-${cat.id}`} className="aip-group-label">
                            {cat.name}
                          </li>,
                          ...cat.subcategories.map((sub) => (
                            <li key={sub.id} className="aip-item aip-item-indent">
                              {renderImageControl(sub)}
                              <input autoComplete="off" id={`field_${sub.id}`} name={`field_${sub.id}`}
                                defaultValue={sub.name}
                                className="input-field aip-item-name"
                                aria-label={`Sub-category ${sub.name}`}
                                onBlur={(e) => handleRenameCategory(sub.id, sub.name, e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn-outline aip-delete"
                                onClick={() => handleDeleteCategory(sub.id, sub.name, true)}
                                aria-label={`Delete sub-category ${sub.name}`}
                              >
                                Delete
                              </button>
                            </li>
                          )),
                        ]
                      )
                  )}
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteConfirmState}
        title={deleteConfirmState?.title || 'Delete Item'}
        message={deleteConfirmState?.message || ''}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          const action = deleteConfirmState?.onConfirm;
          setDeleteConfirmState(null);
          if (action) action();
        }}
        onCancel={() => setDeleteConfirmState(null)}
      />
    </>
  );
}