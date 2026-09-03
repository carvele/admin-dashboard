import React, { useEffect, useState } from 'react';
import { Upload, Settings2, Palette, FolderTree } from 'lucide-react';
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
export default function AdminInventoryPanel({ products, onClose, onProductUpdated }) {
  const [colors, setColors] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]); // [{id, name, subcategories:[]}]
  const [productId, setProductId] = useState('');
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const [dialogMsg, setDialogMsg] = useState(''); // for deletion-blocked dialog
  const [deleteConfirmState, setDeleteConfirmState] = useState(null);

  // Sub-category add form state
  const [newSubName, setNewSubName] = useState('');
  const [newSubParentId, setNewSubParentId] = useState('');

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

  const save = async (e) => {
    e.preventDefault();
    const n = Number(baseline);
    if (!product || !Number.isInteger(n) || n < 0) {
      setError('Enter a non-negative whole number.');
      return;
    }
    try {
      await updateStockBaseline(product.id, n);
      setError('');
      await onProductUpdated();
    } catch (err) {
      setError(err.message);
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
      {cat.imageUrl ? (
        <img src={cat.imageUrl} alt="" className="aip-thumb" />
      ) : (
        <div title="No image set" className="aip-thumb-empty" />
      )}
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

            <form onSubmit={save} className="aip-baseline-row">
              <div className="aip-field">
                <label className="label" htmlFor="baseline-product-select">Select Product</label>
                <select autoComplete="off"
                  id="baseline-product-select"
                  className="input-field"
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setBaseline(products.find((p) => p.id === e.target.value)?.stockbaseline ?? '');
                  }}
                >
                  <option value="">Choose a product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
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

            <div className="aip-grid-2">
              {/* Left: Add top-level category */}
              <div className="aip-field">
                <span className="aip-col-title">Top-Level Categories</span>
                <form onSubmit={handleAddTopCategory} className="aip-add-form">
                  <input autoComplete="off"
                    name="catName"
                    className="input-field"
                    placeholder="e.g. Gowns"
                    aria-label="New top-level category name"
                  />
                  <button className="btn-primary">Add</button>
                </form>

                <ul className="aip-list">
                  {categoryTree.length === 0 ? (
                    <li className="aip-empty">No categories yet</li>
                  ) : (
                    categoryTree.map((cat) => (
                      <li key={cat.id} className="aip-item">
                        {renderImageControl(cat)}
                        <input autoComplete="off" id="field_xoj0xbn" name="field_xoj0xbn"
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

              {/* Right: Add subcategory (pick parent first) */}
              <div className="aip-field">
                <span className="aip-col-title">Sub-Categories</span>
                <form onSubmit={handleAddSubCategory} className="aip-add-form-stacked">
                  <select autoComplete="off" id="field_mmntiqy" name="field_mmntiqy"
                    className="input-field"
                    value={newSubParentId}
                    onChange={(e) => setNewSubParentId(e.target.value)}
                    aria-label="Select parent category"
                  >
                    <option value="">Select parent category...</option>
                    {categoryTree.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <div className="aip-add-form-row">
                    <input autoComplete="off" id="field_pri0jpv" name="field_pri0jpv"
                      className="input-field"
                      placeholder="Sub-category name..."
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      aria-label="New sub-category name"
                    />
                    <button className="btn-primary">Add</button>
                  </div>
                </form>

                {/* Subcategories list — grouped under each parent */}
                <ul className="aip-list">
                  {categoryTree.every((c) => c.subcategories.length === 0) ? (
                    <li className="aip-empty">No sub-categories yet</li>
                  ) : (
                    categoryTree.flatMap((cat) =>
                      cat.subcategories.length === 0 ? [] : [
                        <li key={`hdr-${cat.id}`} className="aip-group-label">
                          {cat.name}
                        </li>,
                        ...cat.subcategories.map((sub) => (
                          <li key={sub.id} className="aip-item aip-item-indent">
                            {renderImageControl(sub)}
                            <input autoComplete="off" id="field_gen7n1d" name="field_gen7n1d"
                              defaultValue={sub.name}
                              className="input-field aip-item-name"
                              aria-label="Sub-category name"
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