import React, { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
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
        borderRadius: '12px',
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
  const list = (title, items, add, update, remove) => (
    <div className="form-group flex-1" style={{ minWidth: '250px' }}>
      <label className="label font-bold" style={{ fontSize: '0.95rem' }}>{title}</label>
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
        className="d-flex gap-2"
        style={{ marginBottom: '0.75rem' }}
      >
        <input
          name="name"
          className="input-field"
          style={{ padding: '0.5rem 0.75rem' }}
          placeholder={`Add new ${title.toLowerCase().slice(0, -1)}...`}
          aria-label={`New ${title}`}
        />
        <button className="btn-primary" style={{ padding: '0.5rem 1rem' }}>Add</button>
      </form>
      <ul
        style={{
          maxHeight: '180px',
          overflowY: 'auto',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '0.5rem',
          backgroundColor: 'var(--cream)',
          listStyle: 'none',
          margin: 0,
        }}
      >
        {items.length === 0 ? (
          <li className="text-secondary text-center text-sm py-2">No {title.toLowerCase()} configured</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="d-flex justify-between align-center"
              style={{
                padding: '0.25rem 0.5rem',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--white)',
                borderRadius: '4px',
                marginBottom: '0.25rem',
              }}
            >
              <input
                defaultValue={item.name}
                className="input-field"
                style={{ border: 'none', background: 'transparent', padding: '0.25rem', fontSize: '0.875rem', boxShadow: 'none', width: '70%' }}
                aria-label={`${title} name`}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val && val !== item.name) {
                    update(item.id, val).then(load).catch((err) => setError(err.message));
                  }
                }}
              />
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--status-cancelled-text)', color: 'var(--status-cancelled-text)', backgroundColor: 'transparent' }}
                onClick={() => {
                  if (window.confirm(`Delete ${item.name}?`)) {
                    remove(item.id).then(load).catch((err) => setError(err.message));
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );

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

  const itemRowStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.3rem 0.5rem',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--white)',
    borderRadius: '4px',
    marginBottom: '0.25rem',
  };

  const deleteButtonStyle = {
    padding: '0.2rem 0.5rem',
    fontSize: '0.7rem',
    borderColor: 'var(--status-cancelled-text)',
    color: 'var(--status-cancelled-text)',
    backgroundColor: 'transparent',
    flexShrink: 0,
  };

  // Thumbnail + upload button shown next to a category/subcategory's name.
  // Shared by the top-level list and the subcategory list below.
  const renderImageControl = (cat) => (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {cat.imageUrl ? (
        <img
          src={cat.imageUrl}
          alt=""
          style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover', marginRight: '0.35rem' }}
        />
      ) : (
        <div
          title="No image set"
          style={{
            width: 24, height: 24, borderRadius: 4, marginRight: '0.35rem',
            backgroundColor: 'var(--cream)', border: '1px dashed var(--border-color)',
          }}
        />
      )}
      <label
        title="Upload image"
        style={{ color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.35rem', display: 'flex' }}
      >
        <Upload size={14} />
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleCategoryImageUpload(cat.id, e.target.files[0])}
        />
      </label>
      {uploadingCatId === cat.id && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', backgroundColor: 'var(--glass-bg)', borderRadius: 4,
          }}
        >
          <div className="loading-spinner" style={{ width: 14, height: 14 }} />
        </div>
      )}
    </div>
  );

  const scrollListStyle = {
    maxHeight: '220px',
    overflowY: 'auto',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    padding: '0.5rem',
    backgroundColor: 'var(--cream)',
    listStyle: 'none',
    margin: 0,
  };

  return (
    <>
      {/* Deletion-blocked error dialog */}
      {dialogMsg && <ErrorDialog message={dialogMsg} onClose={() => setDialogMsg('')} />}

      <div className="card page-animate" style={{ marginBottom: '1.5rem', backgroundColor: 'var(--white)' }}>
        <div
          className="card-header d-flex justify-between align-center"
          style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}
        >
          <h3 className="page-title" style={{ fontSize: '1.2rem', margin: 0 }}>Inventory Administration</h3>
          <button className="btn-secondary small" onClick={onClose}>Close Panel</button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--status-cancelled-bg)',
              color: 'var(--status-cancelled-text)',
              borderRadius: '8px',
              marginBottom: '1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: '1px solid rgba(153, 27, 27, 0.1)',
            }}
          >
            {error}
            <button
              onClick={() => setError('')}
              style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Row 1: Stock Baseline + Colors + Patterns ── */}
        <div className="d-flex flex-wrap gap-6" style={{ marginBottom: '1.5rem' }}>
          {/* Baseline */}
          <form onSubmit={save} className="form-group flex-1" style={{ minWidth: '250px' }}>
            <span className="label font-bold" style={{ fontSize: '0.95rem' }}>Stock Baseline Settings</span>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="label" style={{ fontSize: '0.75rem' }} htmlFor="baseline-product-select">Select Product</label>
              <select
                id="baseline-product-select"
                className="input-field"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setBaseline(products.find((p) => p.id === e.target.value)?.stockbaseline ?? '');
                }}
                style={{ fontSize: '0.875rem' }}
              >
                <option value="">Choose a product...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label className="label" style={{ fontSize: '0.75rem' }} htmlFor="baseline-qty-input">Baseline Quantity</label>
              <input
                id="baseline-qty-input"
                type="number"
                min="0"
                step="1"
                className="input-field"
                value={baseline}
                onChange={(e) => setBaseline(e.target.value)}
                placeholder="e.g. 10"
                style={{ fontSize: '0.875rem' }}
              />
            </div>
            <button className="btn-primary" style={{ width: '100%', padding: '0.6rem' }}>
              Save Baseline
            </button>
          </form>

          {list('Colors', colors, addColor, updateColor, deleteColor)}
          {list('Patterns', patterns, addPattern, updatePattern, deletePattern)}
        </div>

        {/* ── Row 2: Categories (full width) ── */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          <span className="label font-bold" style={{ fontSize: '0.95rem', display: 'block', marginBottom: '1rem' }}>
            Categories &amp; Sub-Categories
          </span>

          <div className="d-flex flex-wrap gap-6">
            {/* Left: Add top-level category */}
            <div className="form-group flex-1" style={{ minWidth: '220px' }}>
              <span className="label" style={{ fontSize: '0.8rem' }}>Add Top-Level Category</span>
              <form onSubmit={handleAddTopCategory} className="d-flex gap-2" style={{ marginBottom: '0.75rem' }}>
                <input
                  name="catName"
                  className="input-field"
                  style={{ padding: '0.5rem 0.75rem' }}
                  placeholder="e.g. Gowns"
                  aria-label="New top-level category name"
                />
                <button className="btn-primary" style={{ padding: '0.5rem 1rem', flexShrink: 0 }}>Add</button>
              </form>

              {/* Top-level categories list */}
              <ul style={scrollListStyle}>
                {categoryTree.length === 0 ? (
                  <li className="text-secondary text-center text-sm py-2">No categories yet</li>
                ) : (
                  categoryTree.map((cat) => (
                    <li key={cat.id} style={itemRowStyle}>
                      {renderImageControl(cat)}
                      <input
                        defaultValue={cat.name}
                        className="input-field"
                        style={{ border: 'none', background: 'transparent', padding: '0.25rem', fontSize: '0.875rem', boxShadow: 'none', fontWeight: 600, width: '65%' }}
                        aria-label="Category name"
                        onBlur={(e) => handleRenameCategory(cat.id, cat.name, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-outline"
                        style={deleteButtonStyle}
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
            <div className="form-group flex-1" style={{ minWidth: '220px' }}>
              <span className="label" style={{ fontSize: '0.8rem' }}>Add Sub-Category</span>
              <form onSubmit={handleAddSubCategory} style={{ marginBottom: '0.75rem' }}>
                <div className="d-flex gap-2" style={{ marginBottom: '0.5rem' }}>
                  <select
                    className="input-field"
                    value={newSubParentId}
                    onChange={(e) => setNewSubParentId(e.target.value)}
                    style={{ fontSize: '0.875rem' }}
                    aria-label="Select parent category"
                  >
                    <option value="">Select parent category...</option>
                    {categoryTree.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="d-flex gap-2">
                  <input
                    className="input-field"
                    style={{ padding: '0.5rem 0.75rem' }}
                    placeholder="Sub-category name..."
                    value={newSubName}
                    onChange={(e) => setNewSubName(e.target.value)}
                    aria-label="New sub-category name"
                  />
                  <button className="btn-primary" style={{ padding: '0.5rem 1rem', flexShrink: 0 }}>Add</button>
                </div>
              </form>

              {/* Subcategories list — grouped under each parent */}
              <ul style={scrollListStyle}>
                {categoryTree.every((c) => c.subcategories.length === 0) ? (
                  <li className="text-secondary text-center text-sm py-2">No sub-categories yet</li>
                ) : (
                  categoryTree.flatMap((cat) =>
                    cat.subcategories.length === 0 ? [] : [
                      <li
                        key={`hdr-${cat.id}`}
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: 'var(--secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          backgroundColor: 'var(--beige)',
                          borderRadius: '4px',
                          marginBottom: '0.2rem',
                        }}
                      >
                        {cat.name}
                      </li>,
                      ...cat.subcategories.map((sub) => (
                        <li key={sub.id} style={{ ...itemRowStyle, marginLeft: '0.5rem' }}>
                          {renderImageControl(sub)}
                          <input
                            defaultValue={sub.name}
                            className="input-field"
                            style={{ border: 'none', background: 'transparent', padding: '0.25rem', fontSize: '0.875rem', boxShadow: 'none', width: '65%' }}
                            aria-label="Sub-category name"
                            onBlur={(e) => handleRenameCategory(sub.id, sub.name, e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-outline"
                            style={deleteButtonStyle}
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
        </div>
      </div>
    </>
  );
}