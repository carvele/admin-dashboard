import { useState, useEffect } from 'react';
import { Plus, Star, Trash2, Edit2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import {
  subscribeToPoseGuides,
  deletePoseGuide,
  getPoseGuideProducts,
  savePoseGuide,
} from '../../services/wardrobeService';
import { uploadToSupabase } from '../../lib/storage';
import { supabase } from '../../lib/supabaseClient';
import ConfirmDialog from '../../components/ConfirmDialog';
import ProductPickerModal from '../../components/ProductPickerModal';
import PageHeader from '../../components/PageHeader';

const OCCASIONS = ['Party', 'Formal', 'Wedding', 'Date Night', 'Casual', 'Festival'];
const DIFFICULTIES = ['easy', 'intermediate', 'pro'];
const POSE_IMAGES_BUCKET = 'pose-images';

const emptyForm = {
  name: '',
  category: '',
  occasion: '',
  difficulty: 'easy',
  description: '',
  sortOrder: 0,
  isFeatured: false,
};

// Ownership is metadata-driven: pose_guides.image_storage_path is the
// authoritative record of whether this feature owns the current image,
// set once at upload time (below) and read back from the DB row for every
// later delete/replace decision -- never re-inferred from the image_url
// string. NULL means "not ours" (the 4 seeded poses' borrowed product
// photos, or any row saved before this column existed) and is never
// deleted. This replaces an earlier version that re-parsed the URL against
// the bucket's public-URL marker on every delete; that worked but was
// fragile to a future bucket rename or CDN fronting silently breaking the
// ownership check.
const deriveUploadedStoragePath = (publicUrl) => {
  const marker = `/object/public/${POSE_IMAGES_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
};

const bestEffortDeletePoseImage = async (storagePath) => {
  if (!storagePath) return;
  try {
    await supabase.storage.from(POSE_IMAGES_BUCKET).remove([storagePath]);
  } catch (e) {
    console.warn('[StyleInspiration] Failed to clean up old pose image:', e);
  }
};

const StyleInspiration = () => {
  const [poses, setPoses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPose, setEditingPose] = useState(null); // null = create mode
  const [formData, setFormData] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const [linkedProducts, setLinkedProducts] = useState([]); // [{id, name, imageUrl}]
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    const unsub = subscribeToPoseGuides((data) => {
      setPoses(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const openCreate = () => {
    setEditingPose(null);
    setFormData(emptyForm);
    setSelectedFile(null);
    setLinkedProducts([]);
    setIsModalOpen(true);
  };

  const openEdit = async (pose) => {
    setEditingPose(pose);
    setFormData({
      name: pose.name || '',
      category: pose.category || '',
      occasion: pose.occasion || '',
      difficulty: pose.difficulty || 'easy',
      description: pose.description || '',
      sortOrder: pose.sortOrder ?? 0,
      isFeatured: !!pose.isFeatured,
    });
    setSelectedFile(null);
    setIsModalOpen(true);

    const rows = await getPoseGuideProducts(pose.docId ?? pose.id);
    // getPoseGuideProducts is a raw PostgREST call, not routed through
    // normaliseRow -- row.product fields are still snake_case.
    setLinkedProducts(
      rows
        .map((r) => r.product)
        .filter(Boolean)
        .map((p) => ({ id: p.id, name: p.name, imageUrl: p.image_url }))
    );
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPose(null);
    setSelectedFile(null);
    setLinkedProducts([]);
  };

  const togglePickedProduct = (productId) => {
    setLinkedProducts((prev) => {
      const exists = prev.some((p) => p.id === productId);
      if (exists) return prev.filter((p) => p.id !== productId);
      return [...prev, { id: productId, name: '(loading…)', imageUrl: null }];
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.category.trim()) {
      toast.error('Name and category are required');
      return;
    }
    setSaving(true);
    try {
      let finalImageUrl = editingPose?.imageUrl || null;
      let finalImageStoragePath = editingPose?.imageStoragePath || null;

      if (selectedFile) {
        finalImageUrl = await uploadToSupabase(selectedFile, POSE_IMAGES_BUCKET, 'pose-guides');
        // Captured once, right here, from the URL we ourselves just
        // uploaded -- this is the one moment ownership can be established
        // with certainty. From here on, every delete/replace decision reads
        // this stored value back, not the URL.
        finalImageStoragePath = deriveUploadedStoragePath(finalImageUrl);
      }

      const previousImageStoragePath = editingPose?.imageStoragePath || null;
      const poseId = editingPose ? (editingPose.docId ?? editingPose.id) : crypto.randomUUID();

      // Single atomic write: the pose row and its product links commit or
      // fail together (save_pose_guide RPC), instead of an upsert followed
      // by a separate Promise.all of link/unlink calls that could leave a
      // pose saved with a stale product list on partial failure.
      await savePoseGuide({
        id: poseId,
        name: formData.name.trim(),
        category: formData.category.trim(),
        occasion: formData.occasion || null,
        difficulty: formData.difficulty || 'easy',
        description: formData.description.trim() || null,
        sort_order: Number(formData.sortOrder) || 0,
        is_featured: formData.isFeatured,
        image_url: finalImageUrl,
        image_storage_path: finalImageStoragePath,
        product_ids: linkedProducts.map((p) => p.id),
      });

      // Update DB first (above), then best-effort clean up the replaced
      // image -- reads the stored ownership marker, never touches an asset
      // this feature doesn't own.
      if (editingPose && selectedFile && previousImageStoragePath && previousImageStoragePath !== finalImageStoragePath) {
        await bestEffortDeletePoseImage(previousImageStoragePath);
      }

      toast.success(editingPose ? 'Pose updated' : 'Pose created');
      closeModal();
    } catch (e) {
      console.error(e);
      toast.error(selectedFile ? 'Image uploaded, but saving the pose failed -- try again' : 'Failed to save pose');
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async () => {
    const pose = deleteConfirm;
    setDeleteConfirm(null);
    if (!pose) return;
    try {
      // Junction rows cascade automatically (pose_guide_products.pose_guide_id
      // is ON DELETE CASCADE) -- no separate unlink pass needed.
      await deletePoseGuide(pose.docId ?? pose.id);
      await bestEffortDeletePoseImage(pose.imageStoragePath);
      toast.success('Pose deleted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete pose');
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Style Inspiration' }]}
        category="CONTENT"
        title="Style Inspiration"
        subtitle="Curate the looks shown on the home screen and on product pages"
        actions={
          <button className="btn-primary flex-center gap-2" onClick={openCreate}>
            <Plus size={16} /> New Pose
          </button>
        }
      />

      <div className="card">
        <div className="table-container">
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Pose</th>
                <th>Category</th>
                <th>Occasion</th>
                <th>Difficulty</th>
                <th>Order</th>
                <th>Featured</th>
                <th>Products</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {poses.map((pose) => (
                <tr key={pose.docId}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="avatar bg-light text-primary flex-center text-lg">
                        {typeof pose.imageUrl === 'string' && pose.imageUrl.startsWith('http') ? (
                          <img
                            src={pose.imageUrl}
                            alt={pose.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          '👗'
                        )}
                      </div>
                      <span className="font-medium">{pose.name}</span>
                    </div>
                  </td>
                  <td>{pose.category}</td>
                  <td>{pose.occasion || <span className="text-secondary">—</span>}</td>
                  <td>{pose.difficulty || <span className="text-secondary">—</span>}</td>
                  <td>{pose.sortOrder ?? 0}</td>
                  <td>{pose.isFeatured ? <Star size={16} className="text-warning" fill="currentColor" /> : null}</td>
                  <td>
                    <PoseProductCount poseId={pose.docId} />
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-outline small" onClick={() => openEdit(pose)}>
                        <Edit2 size={14} /> Edit
                      </button>
                      <button className="btn-outline small text-danger" onClick={() => setDeleteConfirm(pose)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {poses.length === 0 && !loading && (
                <tr>
                  <td colSpan="8" className="text-center p-8 text-secondary">
                    No poses yet. Create one to populate Style Inspiration.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Pose"
        message={`Delete "${deleteConfirm?.name}"? This removes it from Style Inspiration and every product page it appears on. This cannot be undone.`}
        confirmText="Delete Pose"
        cancelText="Cancel"
        isDestructive
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {isModalOpen && (
        <div role="presentation" className="modal-overlay" onClick={closeModal}>
          <div role="presentation" className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>{editingPose ? 'Edit Pose' : 'New Pose'}</h2>
              <button className="close-btn" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="upload-dropzone" style={{ border: '2px dashed var(--border-color)', padding: '20px', textAlign: 'center', borderRadius: '8px', cursor: 'pointer', background: 'var(--bg-hover)', position: 'relative' }}>
                <input
                  autoComplete="off"
                  type="file"
                  accept="image/*"
                  style={{ opacity: 0, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', cursor: 'pointer' }}
                  onChange={(e) => setSelectedFile(e.target.files[0] || null)}
                />
                <div style={{ pointerEvents: 'none' }}>
                  {selectedFile ? (
                    <span className="font-medium text-success">{selectedFile.name}</span>
                  ) : editingPose?.imageUrl ? (
                    <img src={editingPose.imageUrl} alt="" style={{ maxHeight: 80, borderRadius: 6 }} />
                  ) : (
                    <p className="text-sm font-medium">Click to upload a pose image</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="pose-name" className="text-sm font-medium">Name</label>
                <input autoComplete="off" id="pose-name" type="text" className="input-field" value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Boardroom Sharp" />
              </div>

              <div>
                <label htmlFor="pose-category" className="text-sm font-medium">Category</label>
                <input autoComplete="off" id="pose-category" type="text" className="input-field" value={formData.category}
                  onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. Boardroom" />
              </div>

              <div className="flex gap-3">
                <div style={{ flex: 1 }}>
                  <label htmlFor="pose-occasion" className="text-sm font-medium">Occasion</label>
                  <select id="pose-occasion" className="input-field" value={formData.occasion}
                    onChange={(e) => setFormData((f) => ({ ...f, occasion: e.target.value }))}>
                    <option value="">None</option>
                    {OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="pose-difficulty" className="text-sm font-medium">Difficulty</label>
                  <select id="pose-difficulty" className="input-field" value={formData.difficulty}
                    onChange={(e) => setFormData((f) => ({ ...f, difficulty: e.target.value }))}>
                    {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{ width: 100 }}>
                  <label htmlFor="pose-sort" className="text-sm font-medium">Order</label>
                  <input autoComplete="off" id="pose-sort" type="number" className="input-field" value={formData.sortOrder}
                    onChange={(e) => setFormData((f) => ({ ...f, sortOrder: e.target.value }))} />
                </div>
              </div>

              <div>
                <label htmlFor="pose-description" className="text-sm font-medium">Description</label>
                <textarea autoComplete="off" id="pose-description" className="input-field" rows={2} value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))} />
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={formData.isFeatured}
                  onChange={(e) => setFormData((f) => ({ ...f, isFeatured: e.target.checked }))} />
                <span className="text-sm">Featured</span>
              </label>

              {/* Linked products live in the same view as the pose's own
                  metadata -- pose image + info + products is one editorial
                  unit, not a separate afterthought. */}
              <div className="card" style={{ padding: '12px' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <ShoppingBag size={14} /> Linked Products ({linkedProducts.length})
                  </span>
                  <button type="button" className="btn-outline small" onClick={() => setIsPickerOpen(true)}>
                    Edit products
                  </button>
                </div>
                {linkedProducts.length > 0 && (
                  <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                    {linkedProducts.map((p) => (
                      <div key={p.id} className="avatar bg-light text-primary flex-center text-lg" title={p.name}>
                        {typeof p.imageUrl === 'string' && p.imageUrl.startsWith('http') ? (
                          <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                        ) : (
                          '👗'
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProductPickerModal
        isOpen={isPickerOpen}
        title="Select Products for this Look"
        selectedIds={linkedProducts.map((p) => p.id)}
        onToggle={togglePickedProduct}
        onClose={() => setIsPickerOpen(false)}
      />
    </div>
  );
};

// Small isolated subscription per row so the list table doesn't need to
// eagerly join every pose's product count up front.
const PoseProductCount = ({ poseId }) => {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let active = true;
    getPoseGuideProducts(poseId).then((rows) => { if (active) setCount(rows.length); });
    return () => { active = false; };
  }, [poseId]);
  return <span className="tag-badge">{count === null ? '…' : count}</span>;
};

export default StyleInspiration;
