import React, { useState, useEffect } from 'react';
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
} from '../../services/wardrobeService';
import { routeAndUploadFile } from '../../lib/storage';
import './ARAssets.css';

const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const ARAssets = () => {
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

  // Alignment form state
  const [alignPoints, setAlignPoints] = useState({
    shoulderL: '-0.25, 1.45, 0',
    shoulderR: '0.25, 1.45, 0',
    waist: '0, 1.05, 0',
    hips: '0, 0.90, 0',
  });

  // Pose form state
  const [poseForm, setPoseForm] = useState({ name: '', category: 'Calibration' });

  useEffect(() => {
    const unsub = subscribeToProducts((data) => {
      const arTagged = data.filter((p) => p.tags && p.tags.includes('AR Try-On'));
      setAssets(arTagged.filter(p => p.model3DURL));
      setPendingProducts(arTagged.filter(p => !p.model3DURL));
      setLoading(false);
    });
    const unsubPoses = subscribeToPoseGuides(setPoses);
    const unsubLibrary = subscribeToARAssets(setGlobalLibrary);
    return () => {
      unsub();
      unsubPoses();
      unsubLibrary();
    };
  }, []);

  const toggleStatus = async (asset) => {
    const newStatus = asset.arStatus === 'Disabled' ? 'Active' : 'Disabled';
    try {
      await updateProduct(asset.docId, { arStatus: newStatus });
      toast.success(`AR status updated to ${newStatus} for ${asset.name}`);
    } catch (e) {
      toast.error('Failed to update AR status');
    }
  };

  const openConfig = (asset) => {
    setConfigAsset(asset);
    setAlignPoints({
      shoulderL: asset.arAlignPoints?.shoulderL || '-0.25, 1.45, 0',
      shoulderR: asset.arAlignPoints?.shoulderR || '0.25, 1.45, 0',
      waist: asset.arAlignPoints?.waist || '0, 1.05, 0',
      hips: asset.arAlignPoints?.hips || '0, 0.90, 0',
    });
    setIsConfigModalOpen(true);
  };

  const saveAlignmentPoints = async () => {
    if (!configAsset) return;
    try {
      await updateProduct(configAsset.docId, {
        arAlignPoints: alignPoints,
        arAlignments: 'Verified',
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

      // 2. If we were uploading for a specific product, link it now
      if (window._targetProduct) {
        const updateData = assetType === '3D Model' 
          ? { model3DURL: downloadURL, arStatus: 'Active' } 
          : { maskURL: downloadURL };
        
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

  const handleAddPose = async () => {
    if (!poseForm.name.trim()) {
      toast.error('Enter a pose name');
      return;
    }
    try {
      await createPoseGuide({
        id: `P-${String(poses.length + 1).padStart(3, '0')}`,
        name: poseForm.name,
        category: poseForm.category,
      });
      toast.success('Pose guide added!');
      setIsPoseModalOpen(false);
      setPoseForm({ name: '', category: 'Calibration' });
    } catch (e) {
      toast.error('Failed to add pose guide');
    }
  };

  const handleDeletePose = async (pose) => {
    if (!window.confirm(`Delete pose "${pose.name}"?`)) return;
    try {
      await deletePoseGuide(pose.docId);
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
                const status = asset.arStatus || 'Active';
                const alignments = asset.arAlignments || 'Pending';

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
              <button className="btn-outline" onClick={() => window.location.href='/catalog/new'}>
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
                const usage = assets.filter(p => p.model3DURL === item.url || p.maskURL === item.url).length;
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
                                ? { model3DURL: item.url, arStatus: 'Active' } 
                                : { maskURL: item.url };
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

      {/* Add Pose Reference Modal */}
      {isPoseModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPoseModalOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400 }}
          >
            <div className="modal-header">
              <h2>Add Pose Reference</h2>
              <button className="close-btn" onClick={() => setIsPoseModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Pose Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Front T-Pose"
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
                  <option>Calibration</option>
                  <option>Preview</option>
                  <option>Dynamic</option>
                  <option>Turn</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setIsPoseModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleAddPose}>
                Add Pose
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
                  <div className="dummy-3d-model">
                    <Shirt size={100} className="text-secondary opacity-50" />
                    <div className="align-point shoulder-l"></div>
                    <div className="align-point shoulder-r"></div>
                    <div className="align-point waist-c"></div>
                    <div className="align-point hips-l"></div>
                    <div className="align-point hips-r"></div>
                  </div>
                </div>
                <div className="align-controls line-height-2">
                  <h4 className="mb-3">Point Coordinates</h4>
                  <div className="form-group">
                    <label className="label text-xs">Left Shoulder (x,y,z)</label>
                    <input
                      type="text"
                      className="input-field small"
                      value={alignPoints.shoulderL}
                      onChange={(e) =>
                        setAlignPoints({ ...alignPoints, shoulderL: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="label text-xs">Right Shoulder (x,y,z)</label>
                    <input
                      type="text"
                      className="input-field small"
                      value={alignPoints.shoulderR}
                      onChange={(e) =>
                        setAlignPoints({ ...alignPoints, shoulderR: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="label text-xs">Waist Center (x,y,z)</label>
                    <input
                      type="text"
                      className="input-field small"
                      value={alignPoints.waist}
                      onChange={(e) => setAlignPoints({ ...alignPoints, waist: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label text-xs">Hips (x,y,z)</label>
                    <input
                      type="text"
                      className="input-field small"
                      value={alignPoints.hips}
                      onChange={(e) => setAlignPoints({ ...alignPoints, hips: e.target.value })}
                    />
                  </div>

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
