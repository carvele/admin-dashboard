import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Camera,
  View,
  Settings,
  Check,
  Crosshair,
  Shirt,
  Trash2,
  Plus,
  X,
  Star,
  Tag,
  Image as ImageIcon,
  Sparkles,
  Edit3,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  subscribeToProducts,
  updateProduct,
} from '../../services/productService';
import {
  subscribeToPoseGuides,
  createPoseGuide,
  deletePoseGuide,
  subscribeToARAssets,
  createARAsset,
  linkProductToPose,
  unlinkProductFromPose,
  getPoseGuideProducts,
} from '../../services/wardrobeService';
import { routeAndUploadFile } from '../../lib/storage';
import '@google/model-viewer';
import './ARAssets.css';

const parsePoint = (str) => {
  const parts = (str || '').split(',').map(s => parseFloat(s.trim()));
  return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
};
const formatPoint = (p) => `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`;
const toSpaceString = (pointStr) => {
  const p = parsePoint(pointStr);
  return `${p.x} ${p.y} ${p.z}`;
};
const toSpaceStringOffset = (pointStr, xOffset) => {
  const p = parsePoint(pointStr);
  return `${p.x + xOffset} ${p.y} ${p.z}`;
};

const PointSlider = ({ label, pointStr, onChange }) => {
  const p = parsePoint(pointStr);
  const handleUpdate = (axis, val) => {
    onChange(formatPoint({ ...p, [axis]: parseFloat(val) }));
  };
  return (
    <div className="point-slider-group">
      <label>{label}</label>
      <div className="slider-row">
        <span>X:</span>
        <input 
          type="range" min="-1" max="1" step="0.01" 
          value={p.x} onChange={(e) => handleUpdate('x', e.target.value)} 
          role="slider" aria-label={`${label} X Axis`} aria-valuenow={p.x} aria-valuemin={-1} aria-valuemax={1}
        />
        <span className="val">{p.x.toFixed(2)}</span>
      </div>
      <div className="slider-row">
        <span>Y:</span>
        <input 
          type="range" min="0" max="2" step="0.01" 
          value={p.y} onChange={(e) => handleUpdate('y', e.target.value)} 
          role="slider" aria-label={`${label} Y Axis`} aria-valuenow={p.y} aria-valuemin={0} aria-valuemax={2}
        />
        <span className="val">{p.y.toFixed(2)}</span>
      </div>
      <div className="slider-row">
        <span>Z:</span>
        <input 
          type="range" min="-1" max="1" step="0.01" 
          value={p.z} onChange={(e) => handleUpdate('z', e.target.value)} 
          role="slider" aria-label={`${label} Z Axis`} aria-valuenow={p.z} aria-valuemin={-1} aria-valuemax={1}
        />
        <span className="val">{p.z.toFixed(2)}</span>
      </div>
    </div>
  );
};

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const ARAssets = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('assets');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configAsset, setConfigAsset] = useState(null);
  const [assets, setAssets] = useState([]);
  const [pendingProducts, setPendingProducts] = useState([]);
  const [globalLibrary, setGlobalLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poses, setPoses] = useState([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [productToLink, setProductToLink] = useState(null);
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const [allCatalogProducts, setAllCatalogProducts] = useState([]);
  const [poseFile, setPoseFile] = useState(null);
  const [editingPoseId, setEditingPoseId] = useState(null);
  const [poseProductsMap, setPoseProductsMap] = useState({});

  // Alignment form state
  const [alignPoints, setAlignPoints] = useState({
    shoulderL: '-0.25, 1.45, 0',
    shoulderR: '0.25, 1.45, 0',
    waist: '0, 1.05, 0',
    hips: '0, 0.90, 0',
  });

  // Pose form state
  const initialPoseForm = {
    name: '',
    category: 'Style Hint',
    image_url: '',
    description: '',
    occasion: 'Casual',
    difficulty: 'easy',
    is_featured: true,
    base_pose_type: 'front',
    linkedProductIds: [],
  };
  const [poseForm, setPoseForm] = useState(initialPoseForm);

  useEffect(() => {
    const unsub = subscribeToProducts((data) => {
      setAllCatalogProducts(data);
      const arTagged = data.filter((p) => p.tags && p.tags.includes('AR Try-On'));
      // toCamel()'s regex only converts "_" + lowercase letter, so
      // model_3d_url becomes model_3dUrl (the "_3" doesn't match), not
      // model3DURL -- reading the latter left both tabs permanently wrong
      // (Linked always empty, Pending always showing every AR-tagged
      // product regardless of actual configuration).
      setAssets(arTagged.filter(p => p.model_3dUrl));
      setPendingProducts(arTagged.filter(p => !p.model_3dUrl));
      setLoading(false);
    });
    const unsubPoses = subscribeToPoseGuides(async (poseData) => {
      setPoses(poseData);
      // Fetch linked products for each pose
      const map = {};
      for (const pose of poseData) {
        if (pose.id) {
          try {
            const linked = await getPoseGuideProducts(pose.id);
            map[pose.id] = linked;
          } catch (e) {
            console.error(e);
          }
        }
      }
      setPoseProductsMap(map);
    });
    const unsubLibrary = subscribeToARAssets(setGlobalLibrary);
    return () => {
      unsub();
      unsubPoses();
      unsubLibrary();
    };
  }, []);

  // products.ar_data is a single jsonb blob (status/alignPoints/alignments),
  // not real columns -- a plain UPDATE replaces the whole column value, so
  // every write here merges onto the asset's current ar_data rather than
  // clobbering fields it isn't touching.
  const updateArData = async (docId, currentArData, patch) => {
    const merged = { ...(currentArData || {}), ...patch };
    await updateProduct(docId, { arData: merged });
    return merged;
  };

  const toggleStatus = async (asset) => {
    const newStatus = asset.arData?.status === 'Disabled' ? 'Active' : 'Disabled';
    try {
      await updateArData(asset.docId, asset.arData, { status: newStatus });
      toast.success(`AR status updated to ${newStatus} for ${asset.name}`);
    } catch (e) {
      toast.error('Failed to update AR status');
    }
  };

  const openConfig = (asset) => {
    setConfigAsset(asset);
    setAlignPoints({
      shoulderL: asset.arData?.alignPoints?.shoulderL || '-0.25, 1.45, 0',
      shoulderR: asset.arData?.alignPoints?.shoulderR || '0.25, 1.45, 0',
      waist: asset.arData?.alignPoints?.waist || '0, 1.05, 0',
      hips: asset.arData?.alignPoints?.hips || '0, 0.90, 0',
    });
    setIsConfigModalOpen(true);
  };

  const saveAlignmentPoints = async () => {
    if (!configAsset) return;
    try {
      await updateArData(configAsset.docId, configAsset.arData, {
        alignPoints,
        alignments: 'Verified',
      });
      toast.success('Alignment points saved & verified!');
      setIsConfigModalOpen(false);
    } catch (e) {
      toast.error('Failed to save alignment points');
    }
  };

  const handleUploadARAsset = async () => {
    if (!selectedFile) {
      toast.error('Select a file to upload');
      return;
    }
    setIsUploading(true);
    try {
      console.log('[Storage] Uploading asset to Storage...');
      const downloadURL = await routeAndUploadFile(selectedFile, selectedFile.name.endsWith('.glb') ? 'catalog-assets/models' : 'catalog-assets/masks');
      
      const assetType = selectedFile.name.endsWith('.glb') ? '3D Model' : 'Segmentation Mask';
      
      // 1. Register in Global Library
      await createARAsset({
        name: selectedFile.name,
        url: downloadURL,
        type: assetType,
        source: 'ar_hub_upload',
        timestamp: Date.now()
      });

      // 2. If we were uploading for a specific product, link it now.
      // model_3dUrl/maskUrl (not model3DURL/maskURL) -- toSnake() turns
      // every capital letter into its own "_x", so model3DURL became the
      // nonexistent column model3_d_u_r_l and this always threw. The real
      // columns are model_3d_url/mask_url; model_3dUrl is what actually
      // round-trips to them (matches how this file already reads
      // p.model_3dUrl elsewhere, per the toCamel-quirk comment above).
      if (window._targetProduct) {
        const updateData = assetType === '3D Model'
          ? { model_3dUrl: downloadURL, arData: { ...(window._targetProduct.arData || {}), status: 'Active' } }
          : { maskUrl: downloadURL };

        await updateProduct(window._targetProduct.docId, updateData);
        toast.success(`Successfully uploaded and linked ${assetType} to ${window._targetProduct.name}`);
        window._targetProduct = null;
      } else {
        toast.success(`${assetType} uploaded to global library.`);
      }

      setIsUploadModalOpen(false);
      setSelectedFile(null);
    } catch (e) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const resetPoseForm = () => {
    setPoseForm(initialPoseForm);
    setPoseFile(null);
    setEditingPoseId(null);
  };

  const handleOpenEditPose = async (pose) => {
    setEditingPoseId(pose.id);
    const linked = poseProductsMap[pose.id] || [];
    setPoseForm({
      name: pose.name || '',
      category: pose.category || 'Style Hint',
      image_url: pose.image_url || '',
      description: pose.description || '',
      occasion: pose.occasion || 'Casual',
      difficulty: pose.difficulty || 'easy',
      is_featured: pose.is_featured ?? true,
      base_pose_type: pose.base_pose_type || 'front',
      linkedProductIds: linked.map(l => l.product_id),
    });
    setPoseFile(null);
    setIsPoseModalOpen(true);
  };

  const handleAddPose = async () => {
    if (!poseForm.name.trim()) {
      toast.error('Enter a pose name');
      return;
    }
    setIsUploading(true);
    try {
      let imageUrl = poseForm.image_url;
      if (poseFile) {
        imageUrl = await routeAndUploadFile(poseFile, 'pose-images');
      }

      const poseId = editingPoseId || `P-${String(poses.length + 1).padStart(3, '0')}`;
      await createPoseGuide({
        id: poseId,
        name: poseForm.name,
        category: poseForm.category,
        image_url: imageUrl,
        description: poseForm.description,
        occasion: poseForm.occasion,
        difficulty: poseForm.difficulty,
        is_featured: poseForm.is_featured,
        base_pose_type: poseForm.base_pose_type,
      });

      // Handle product linking
      const existingLinked = poseProductsMap[poseId] || [];
      const existingIds = existingLinked.map(l => l.product_id);
      
      // Unlink removed products
      for (const oldId of existingIds) {
        if (!poseForm.linkedProductIds.includes(oldId)) {
          await unlinkProductFromPose(poseId, oldId);
        }
      }
      // Link new products
      for (const newId of poseForm.linkedProductIds) {
        if (!existingIds.includes(newId)) {
          await linkProductToPose(poseId, newId);
        }
      }

      toast.success(editingPoseId ? 'Style pose updated!' : 'Style pose added!');
      setIsPoseModalOpen(false);
      resetPoseForm();
    } catch (e) {
      console.error(e);
      toast.error('Failed to save pose guide: ' + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePose = async (pose) => {
    if (!window.confirm(`Delete pose "${pose.name}"?`)) return;
    try {
      await deletePoseGuide(pose.docId || pose.id);
      toast.success('Pose deleted');
    } catch (e) {
      toast.error('Failed to delete pose');
    }
  };

  // Default poses if none in DB
  const displayPoses =
    poses.length > 0
      ? poses
      : [
          { id: 'P-001', name: 'Front T-Pose', category: 'Calibration', docId: null },
          { id: 'P-002', name: 'Side Profile', category: 'Preview', docId: null },
          { id: 'P-003', name: 'Walking Stride', category: 'Dynamic', docId: null },
          { id: 'P-004', name: 'Over-the-shoulder', category: 'Turn', docId: null },
        ];

  return (
    <div className="ar-container">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">AR Try-On Management</h1>
          <p className="page-subtitle">Configure 3D assets, alignment points, and pose guides</p>
        </div>
        <div className="tab-switcher card p-1">
          <button
            className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <Plus size={16} /> Pending Setup
            {pendingProducts.length > 0 && (
              <span className="count-badge">{pendingProducts.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            <Check size={16} /> Linked Products
          </button>
          <button
            className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            <Shirt size={16} /> Global Library
          </button>
          <button
            className={`tab-btn ${activeTab === 'poses' ? 'active' : ''}`}
            onClick={() => setActiveTab('poses')}
          >
            <Camera size={16} /> Pose Guides
          </button>
        </div>
      </div>

      {activeTab === 'pending' && (
        <div className="card">
          <div className="card-header">
            <h3>Production Line: Items Needing AR Setup</h3>
            <p className="text-secondary text-sm">Products tagged "AR Try-On" in the Catalog waiting for 3D Assets.</p>
          </div>
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingProducts.map((p) => (
                <tr key={p.docId}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="avatar bg-light text-primary flex-center text-lg">{p.imageUrl || '👗'}</div>
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td>{p.category}</td>
                  <td>
                    <span className="align-status pending">Missing Assets</span>
                  </td>
                  <td>
                    <button 
                      className="btn-primary small"
                      onClick={() => {
                        setProductToLink(p);
                        setIsLinkModalOpen(true);
                      }}
                    >
                      Setup AR
                    </button>
                  </td>
                </tr>
              ))}
              {pendingProducts.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center p-12 text-secondary">
                    <Check size={48} className="mx-auto block opacity-20 mb-2" />
                    No pending products. All AR items are configured!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'assets' && (
        <div className="card">
          <div className="card-header">
            <h3>Clothing AR Assets</h3>
            <button
              className="btn-primary flex-center gap-2"
              onClick={() => setIsUploadModalOpen(true)}
            >
              <Upload size={16} /> Upload New Asset
            </button>
          </div>
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Associated Item</th>
                <th>File Type</th>
                <th>Alignment Config</th>
                <th>AR Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const status = asset.arData?.status || 'Active';
                const alignments = asset.arData?.alignments || 'Pending';

                return (
                  <tr key={asset.docId}>
                    <td className="font-mono text-sm">{asset.docId.substring(0, 8)}...</td>
                    <td className="font-medium">{asset.name}</td>
                    <td className="text-secondary">3D Model (.glb)</td>
                    <td>
                      <span className={`align-status ${alignments.toLowerCase()}`}>
                        {alignments === 'Verified' && <Check size={14} />}
                        {alignments === 'Pending' && <Settings size={14} />}
                        {alignments === 'Failed' && <Crosshair size={14} />}
                        {alignments}
                      </span>
                    </td>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={status === 'Active'}
                          onChange={() => toggleStatus(asset)}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-outline small" onClick={() => openConfig(asset)}>
                          Configure Points
                        </button>
                        <button className="btn-outline small">Preview</button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {assets.length === 0 && !loading && (
                <tr>
                  <td colSpan="6" className="text-center p-8 text-secondary">
                    No active AR assets linked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'library' && (
        <div className="card">
          <div className="card-header">
            <h3>Global 3D Asset Library</h3>
            <div className="flex gap-2">
              <button className="btn-outline" onClick={() => navigate('/catalog/new')}>
                Create AR Product
              </button>
              <button
                className="btn-primary flex-center gap-2"
                onClick={() => {
                  window._targetProduct = null;
                  setIsUploadModalOpen(true);
                }}
              >
                <Upload size={16} /> Upload New File
              </button>
            </div>
          </div>
          <p className="text-secondary text-sm p-4 border-b">
            These files can be linked to any product. 
            Usage reflects how many clothing items currently use this specific model.
            {window._targetProduct && (
              <span className="text-accent font-semibold block mt-1">
                👉 Click "Link to Product" to assign to {window._targetProduct.name}
              </span>
            )}
          </p>
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Type</th>
                <th>Uploaded</th>
                <th>Linked Products</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {globalLibrary.map((item, idx) => {
                const usage = assets.filter(p => p.model_3dUrl === item.url || p.maskUrl === item.url).length;
                return (
                  <tr key={idx}>
                    <td className="font-medium">{item.name}</td>
                    <td>{item.type}</td>
                    <td className="text-secondary">{new Date(item.timestamp).toLocaleDateString()}</td>
                    <td>
                      <span className={`tag-badge ${usage > 0 ? 'success' : 'warning'}`}>
                        {usage} products
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        {window._targetProduct ? (
                          <button 
                            className="btn-primary small"
                            onClick={async () => {
                              const updateData = item.type === '3D Model'
                                ? { model_3dUrl: item.url, arData: { ...(window._targetProduct.arData || {}), status: 'Active' } }
                                : { maskUrl: item.url };
                              await updateProduct(window._targetProduct.docId, updateData);
                              toast.success(`Linked ${item.name} to ${window._targetProduct.name}`);
                              window._targetProduct = null;
                              setActiveTab('assets');
                            }}
                          >
                            Link to Product
                          </button>
                        ) : (
                          <button className="btn-outline small">Preview</button>
                        )}
                        <button className="btn-outline small text-danger">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {globalLibrary.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center p-8 text-secondary">
                    No files found in the global library.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'poses' && (
        <div className="space-y-6 mt-4">
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold">AR Pose Guides & Calibration Specs</h3>
                <p className="text-secondary text-sm">
                  Pose reference guides used by the mobile app&apos;s MediaPipe Pose Detection engine for calibration and virtual fitting overlays.
                </p>
              </div>
              <button
                className="btn-primary flex-center gap-2"
                onClick={() => {
                  resetPoseForm();
                  setIsPoseModalOpen(true);
                }}
              >
                <Plus size={16} /> Add Style Pose Guide
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
              {displayPoses.map((pose) => {
                const linkedCount = (poseProductsMap[pose.id] || []).length;
                return (
                  <div key={pose.id} className="border rounded-xl p-4 bg-gray-50/50 hover:shadow-md transition-all relative group flex flex-col justify-between">
                    <div>
                      <div className="h-44 bg-slate-900 rounded-lg flex items-center justify-center relative overflow-hidden mb-3">
                        {pose.image_url ? (
                          <img src={pose.image_url} alt={pose.name} className="w-full h-full object-cover" />
                        ) : (
                          <Camera size={36} className="text-indigo-400 opacity-60" />
                        )}
                        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1">
                          {pose.id}
                          {pose.is_featured && <Star size={10} className="text-amber-400 fill-amber-400" />}
                        </div>
                        <div className="absolute bottom-2 right-2 bg-indigo-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                          {pose.category || 'Style Hint'}
                        </div>
                        {pose.occasion && (
                          <div className="absolute bottom-2 left-2 bg-black/70 text-amber-300 text-[10px] font-medium px-2 py-0.5 rounded">
                            {pose.occasion}
                          </div>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-gray-900">{pose.name}</h4>
                      {pose.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{pose.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {pose.difficulty && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                            pose.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                            pose.difficulty === 'intermediate' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {pose.difficulty}
                          </span>
                        )}
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                          <Shirt size={10} /> {linkedCount} linked
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t">
                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                        <Check size={12} /> Mobile Active
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          className="text-indigo-600 hover:text-indigo-800 p-1 text-xs font-bold"
                          onClick={() => handleOpenEditPose(pose)}
                          title="Edit Style Pose"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          className="text-red-500 hover:text-red-700 p-1 text-xs font-bold"
                          onClick={() => handleDeletePose(pose)}
                          title="Delete Pose"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-6 border-2 border-indigo-100 bg-indigo-50/10">
            <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-900 mb-2 flex items-center gap-2">
              <View size={16} /> Mobile AR Pose Detection Integration Status
            </h3>
            <p className="text-xs text-indigo-700 mb-4">
              Side-by-side verification between Admin Pose Specifications and Mobile App Runtime (MediaPipe 33 Landmarks).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded-xl border border-indigo-200">
                <h4 className="font-bold text-xs text-indigo-900 uppercase mb-2">Admin Specification</h4>
                <ul className="text-xs text-gray-600 space-y-1.5">
                  <li>• Keypoints: 33 body landmarks (Shoulders, Hips, Elbows, Knees)</li>
                  <li>• Tracking Model: MediaPipe Full Body Heavy</li>
                  <li>• Calibration Threshold: 85% confidence score</li>
                </ul>
              </div>
              <div className="bg-white p-4 rounded-xl border border-indigo-200">
                <h4 className="font-bold text-xs text-indigo-900 uppercase mb-2">Mobile App Compatibility</h4>
                <ul className="text-xs text-gray-600 space-y-1.5">
                  <li>• Package: react-native-mediapipe-posedetection</li>
                  <li>• Background Removal: @six33/react-native-bg-removal</li>
                  <li>• Real-time FPS: 30 FPS camera feed overlay</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Assets Modal */}
      {isLinkModalOpen && productToLink && (
        <div className="modal-overlay" onClick={() => setIsLinkModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Setup AR: {productToLink.name}</h2>
              <button type="button" className="close-btn" onClick={() => setIsLinkModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="flex flex-col gap-6">
                <div>
                  <h4 className="text-sm font-semibold mb-3">Quick Actions</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      className="btn-outline flex-col py-8 gap-3 h-auto"
                      onClick={() => {
                        setIsLinkModalOpen(false);
                        setIsUploadModalOpen(true);
                        window._targetProduct = productToLink;
                      }}
                    >
                      <Upload size={32} />
                      <div className="text-center">
                        <p className="font-semibold">Upload Asset</p>
                        <p className="text-xs text-secondary">New .glb or mask</p>
                      </div>
                    </button>
                    <button 
                      className="btn-outline flex-col py-8 gap-3 h-auto"
                      onClick={() => {
                        setActiveTab('library');
                        setIsLinkModalOpen(false);
                        toast.info(`Select an asset for ${productToLink.name}`);
                        window._targetProduct = productToLink;
                      }}
                    >
                      <Shirt size={32} />
                      <div className="text-center">
                        <p className="font-semibold">Pick from Library</p>
                        <p className="text-xs text-secondary">Reuse existing</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload AR Asset Modal */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <div className="modal-header">
              <h2>Upload AR Asset</h2>
              <button className="close-btn" onClick={() => setIsUploadModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p className="text-secondary text-sm mb-3">
                Upload a 3D model file (.glb, .gltf) for AR Try-On. After uploading, tag a product
                with "AR Try-On" in the Catalog to associate this asset.
              </p>
              <div className="upload-dropzone">
                <input
                  type="file"
                  id="ar-upload"
                  accept=".glb,.gltf,image/*"
                  className="file-input-hidden"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                />
                <label htmlFor="ar-upload" className="upload-label-content">
                  {selectedFile ? (
                    <div className="flex-center gap-2 text-success">
                      <Check size={20} />
                      <span className="font-medium">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={32} className="text-secondary mb-2" />
                      <p className="text-sm font-medium">Click to upload 3D model or image</p>
                      <span className="text-xs text-secondary mt-1">
                        Supports .glb, .gltf, .png, .jpg
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-outline"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setSelectedFile(null);
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleUploadARAsset}
                disabled={isUploading || !selectedFile}
              >
                {isUploading ? 'Uploading...' : 'Upload Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Style Pose Reference Modal */}
      {isPoseModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPoseModalOpen(false)}>
          <div
            className="modal-content modal-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 650, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div className="modal-header">
              <h2>{editingPoseId ? `Edit Style Pose — ${editingPoseId}` : 'Add Style Pose Guide'}</h2>
              <button className="close-btn" onClick={() => setIsPoseModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label">Pose Name *</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g., Gala Red Carpet Pose"
                    value={poseForm.name}
                    onChange={(e) => setPoseForm({ ...poseForm, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="label">Category</label>
                  <select
                    className="input-field"
                    value={poseForm.category}
                    onChange={(e) => setPoseForm({ ...poseForm, category: e.target.value })}
                  >
                    <option>Style Hint</option>
                    <option>Calibration</option>
                    <option>Preview</option>
                    <option>Dynamic</option>
                    <option>Turn</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="form-group">
                  <label className="label">Occasion</label>
                  <select
                    className="input-field"
                    value={poseForm.occasion}
                    onChange={(e) => setPoseForm({ ...poseForm, occasion: e.target.value })}
                  >
                    <option>Casual</option>
                    <option>Party</option>
                    <option>Formal</option>
                    <option>Wedding</option>
                    <option>Date Night</option>
                    <option>Business</option>
                    <option>Festival</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Difficulty</label>
                  <select
                    className="input-field"
                    value={poseForm.difficulty}
                    onChange={(e) => setPoseForm({ ...poseForm, difficulty: e.target.value })}
                  >
                    <option value="easy">Easy (Standing / Simple)</option>
                    <option value="intermediate">Intermediate (Side / Angled)</option>
                    <option value="advanced">Advanced (Dynamic / Turn)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Base AR Matcher</label>
                  <select
                    className="input-field"
                    value={poseForm.base_pose_type}
                    onChange={(e) => setPoseForm({ ...poseForm, base_pose_type: e.target.value })}
                  >
                    <option value="front">Front Facing</option>
                    <option value="side">Side Profile</option>
                    <option value="walking">Walking / Stride</option>
                    <option value="turn">Turn / Over Shoulder</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Styled Reference Image</label>
                <div className="flex items-center gap-4">
                  {(poseFile || poseForm.image_url) && (
                    <div className="w-20 h-24 rounded border overflow-hidden bg-slate-900 flex-shrink-0">
                      <img
                        src={poseFile ? URL.createObjectURL(poseFile) : poseForm.image_url}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="input-field"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setPoseFile(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label">Description / Styling Tip</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="e.g., Stand with one leg slightly forward to highlight full dress silhouette..."
                  value={poseForm.description}
                  onChange={(e) => setPoseForm({ ...poseForm, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="label flex items-center justify-between">
                  <span>Linked Catalog Products ({poseForm.linkedProductIds.length})</span>
                  <span className="text-xs text-secondary font-normal">Select garments featured in this look</span>
                </label>
                <div className="border rounded-lg p-3 max-h-44 overflow-y-auto space-y-2 bg-gray-50">
                  {allCatalogProducts.map((p) => {
                    const isChecked = poseForm.linkedProductIds.includes(p.id || p.docId);
                    return (
                      <label key={p.id || p.docId} className="flex items-center gap-3 p-1.5 hover:bg-white rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const pid = p.id || p.docId;
                            if (e.target.checked) {
                              setPoseForm({ ...poseForm, linkedProductIds: [...poseForm.linkedProductIds, pid] });
                            } else {
                              setPoseForm({
                                ...poseForm,
                                linkedProductIds: poseForm.linkedProductIds.filter(id => id !== pid),
                              });
                            }
                          }}
                        />
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-8 h-8 object-cover rounded" />
                        ) : (
                          <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center text-xs">👔</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-500">{p.category} · ₱{p.rental_price || p.price}</p>
                        </div>
                      </label>
                    );
                  })}
                  {allCatalogProducts.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">No catalog products found.</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_featured_cb"
                  checked={poseForm.is_featured}
                  onChange={(e) => setPoseForm({ ...poseForm, is_featured: e.target.checked })}
                />
                <label htmlFor="is_featured_cb" className="text-xs font-bold text-gray-700 cursor-pointer">
                  Feature on Mobile Home Style Inspiration Feed
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-outline"
                onClick={() => {
                  setIsPoseModalOpen(false);
                  resetPoseForm();
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleAddPose}
                disabled={isUploading}
              >
                {isUploading ? 'Saving Pose...' : editingPoseId ? 'Update Style Pose' : 'Create Style Pose'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alignment Config Modal */}
      {isConfigModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <div className="modal-header">
              <h2>Configure Alignment Points {configAsset && `— ${configAsset.name}`}</h2>
              <button className="close-btn" onClick={() => setIsConfigModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body align-modal-body">
              <div className="align-workspace">
                <div className="align-preview-area">
                  {configAsset && configAsset.model_3dUrl ? (
                    <model-viewer
                      src={configAsset.model_3dUrl}
                      alt={configAsset.name}
                      auto-rotate
                      camera-controls
                      ar
                    >
                      <button className="Hotspot" slot="hotspot-shoulder-l" data-position={toSpaceString(alignPoints.shoulderL)} data-normal="0 0 1"></button>
                      <button className="Hotspot" slot="hotspot-shoulder-r" data-position={toSpaceString(alignPoints.shoulderR)} data-normal="0 0 1"></button>
                      <button className="Hotspot" slot="hotspot-waist" data-position={toSpaceString(alignPoints.waist)} data-normal="0 0 1"></button>
                      <button className="Hotspot" slot="hotspot-hips-l" data-position={toSpaceStringOffset(alignPoints.hips, -0.15)} data-normal="0 0 1"></button>
                      <button className="Hotspot" slot="hotspot-hips-r" data-position={toSpaceStringOffset(alignPoints.hips, 0.15)} data-normal="0 0 1"></button>
                    </model-viewer>
                  ) : (
                    <div className="dummy-3d-model">
                      <Shirt size={100} className="text-secondary opacity-50" />
                      <div className="align-point shoulder-l"></div>
                      <div className="align-point shoulder-r"></div>
                      <div className="align-point waist-c"></div>
                      <div className="align-point hips-l"></div>
                      <div className="align-point hips-r"></div>
                    </div>
                  )}
                </div>
                <div className="align-controls line-height-2">
                  <h4 className="mb-3">Point Coordinates</h4>
                  <PointSlider
                    label="Left Shoulder"
                    pointStr={alignPoints.shoulderL}
                    onChange={(val) => setAlignPoints({ ...alignPoints, shoulderL: val })}
                  />
                  <PointSlider
                    label="Right Shoulder"
                    pointStr={alignPoints.shoulderR}
                    onChange={(val) => setAlignPoints({ ...alignPoints, shoulderR: val })}
                  />
                  <PointSlider
                    label="Waist Center"
                    pointStr={alignPoints.waist}
                    onChange={(val) => setAlignPoints({ ...alignPoints, waist: val })}
                  />
                  <PointSlider
                    label="Hips"
                    pointStr={alignPoints.hips}
                    onChange={(val) => setAlignPoints({ ...alignPoints, hips: val })}
                  />

                  <button className="btn-primary full-width mt-4" onClick={saveAlignmentPoints}>
                    Save & Verify Points
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ARAssets;
