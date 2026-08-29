import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Settings,
  Check,
  Crosshair,
  Shirt,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  subscribeToProducts,
  updateProduct,
} from '../../services/productService';
import {
  subscribeToARAssets,
  createARAsset,
  deleteARAsset,
} from '../../services/wardrobeService';
import { routeAndUploadFile } from '../../lib/storage';
import ConfirmDialog from '../../components/ConfirmDialog';
import PageHeader from '../../components/PageHeader';
import GarmentIngestionModal from '../../components/AR/GarmentIngestionModal';
import { supabase } from '../../lib/supabaseClient';
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
        <input id="ar-pos-x" name="ar-pos-x" type="range" min="-1" max="1" step="0.01" 
          value={p.x} onChange={(e) => handleUpdate('x', e.target.value)}
          aria-label={`${label} X Axis`} aria-valuenow={p.x} aria-valuemin={-1} aria-valuemax={1}
        />
        <span className="val">{p.x.toFixed(2)}</span>
      </div>
      <div className="slider-row">
        <span>Y:</span>
        <input id="ar-pos-y" name="ar-pos-y" type="range" min="0" max="2" step="0.01" 
          value={p.y} onChange={(e) => handleUpdate('y', e.target.value)}
          aria-label={`${label} Y Axis`} aria-valuenow={p.y} aria-valuemin={0} aria-valuemax={2}
        />
        <span className="val">{p.y.toFixed(2)}</span>
      </div>
      <div className="slider-row">
        <span>Z:</span>
        <input id="ar-pos-z" name="ar-pos-z" type="range" min="-1" max="1" step="0.01" 
          value={p.z} onChange={(e) => handleUpdate('z', e.target.value)}
          aria-label={`${label} Z Axis`} aria-valuenow={p.z} aria-valuemin={-1} aria-valuemax={1}
        />
        <span className="val">{p.z.toFixed(2)}</span>
      </div>
    </div>
  );
};

const ARAssets = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('assets');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configAsset, setConfigAsset] = useState(null);
  const [assets, setAssets] = useState([]);
  const [pendingProducts, setPendingProducts] = useState([]);
  const [globalLibrary, setGlobalLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [ingestionData, setIngestionData] = useState(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [productToLink, setProductToLink] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const [allCatalogProducts, setAllCatalogProducts] = useState([]);
  
  const [previewAssetUrl, setPreviewAssetUrl] = useState(null);
  const [deleteAssetConfirm, setDeleteAssetConfirm] = useState(null);

  // Alignment form state
  const [alignPoints, setAlignPoints] = useState({
    shoulderL: '-0.25, 1.45, 0',
    shoulderR: '0.25, 1.45, 0',
    waist: '0, 1.05, 0',
    hips: '0, 0.90, 0',
  });


  const handleIngestionComplete = async ({ metadata, riggedBlob }) => {
    try {
      let finalModelUrl = ingestionData.glbUrl;
      
      if (riggedBlob) {
        // Upload the new rigged GLB
        const file = new File([riggedBlob], `${ingestionData.productId}_rigged.glb`, { type: 'model/gltf-binary' });
        finalModelUrl = await routeAndUploadFile(file, 'catalog-assets/models');
      }

      // Fetch the asset's current arData from local state so we can merge it
      const targetAsset = allCatalogProducts.find(p => p.docId === ingestionData.productId);
      const currentArData = targetAsset?.arData || {};

      await updateProduct(ingestionData.productId, { 
        garment_metadata: metadata,
        model_3d_url: finalModelUrl,
        arData: { ...currentArData, alignments: 'Verified' }
      });
      
      setIngestionData(null);
      toast.success('Garment metadata generated and saved successfully!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save garment metadata to database.');
    }
  };


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
    const unsubLibrary = subscribeToARAssets(setGlobalLibrary);
    return () => {
      unsub();
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
    } catch {
      toast.error('Failed to update AR status');
    }
  };

  const openConfig = (asset) => {
    // Phase 5B: Launch the new GarmentIngestionModal instead of legacy alignment-point modal
    if (asset.model_3dUrl) {
      setIngestionData({
        productId: asset.docId,
        category: asset.category || 'shirt',
        glbUrl: asset.model_3dUrl,
        productName: asset.name,
        existingMetadata: asset.garment_metadata || null,
      });
    } else {
      toast.error('No 3D model linked to this product. Upload a GLB first.');
    }
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
    } catch {
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
      const fileName = selectedFile.name.toLowerCase();
      const is3D = fileName.endsWith('.glb') || fileName.endsWith('.gltf') || fileName.endsWith('.obj');
      const downloadURL = await routeAndUploadFile(selectedFile, is3D ? 'catalog-assets/models' : 'catalog-assets/masks');
      
      const assetType = is3D ? '3D Model' : 'Segmentation Mask';

      // 1. Register in Global Library. public.ar_assets only has
      // id/product_id/model_url/created_at/updated_at -- no name/type/
      // source/timestamp columns, so those are derived from modelUrl at
      // render time instead of stored (see the globalLibrary table below).
      // productId is null for a library-only upload (no target product
      // picked yet); linking happens later via "Link to Product".
      await createARAsset({
        productId: window._targetProduct?.docId ?? null,
        modelUrl: downloadURL,
      });

      // 2. If we were uploading for a specific product, link it now.
      // model_3dUrl/maskUrl (not model3DURL/maskURL) -- toSnake() turns
      // every capital letter into its own "_x", so model3DURL became the
      // nonexistent column model3_d_u_r_l and this always threw. The real
      // columns are model_3d_url/mask_url; model_3dUrl is what actually
      // round-trips to them (matches how this file already reads
      // p.model_3dUrl elsewhere, per the toCamel-quirk comment above).
      if (window._targetProduct) {
        if (assetType === '3D Model') {
          setIngestionData({
            productId: window._targetProduct.docId,
            category: window._targetProduct.category || 'shirt',
            glbUrl: downloadURL,
            productName: window._targetProduct.name
          });
          setIsUploadModalOpen(false);
          setSelectedFile(null);
          setIsUploading(false);
          return;
        }

        const updateData = { maskUrl: downloadURL };
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






  const executeDeleteAsset = async () => {
    const asset = deleteAssetConfirm;
    setDeleteAssetConfirm(null);
    if (!asset) return;
    try {
      await deleteARAsset(asset.id || asset.docId);
      toast.success('Asset deleted from library');
    } catch {
      toast.error('Failed to delete asset');
    }
  };


  return (
    <div className="ar-container">
      <PageHeader
        category="OPERATIONS"
        title="AR Try-On Management"
        subtitle="Configure 3D assets and alignment points"
        actions={
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
          </div>
        }
      />

      {activeTab === 'pending' && (
        <div className="card">
          <div className="card-header">
            <h3>Production Line: Items Needing AR Setup</h3>
            <p className="text-secondary text-sm">Products tagged &quot;AR Try-On&quot; in the Catalog waiting for 3D Assets.</p>
          </div>
          <div className="table-container">
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
          <div className="table-container">
            <table className="table mt-4">
              <thead>
                <tr>
                  <th>Asset ID</th>
                  <th>Associated Item</th>
                  <th>File Name</th>
                  <th>Alignment Config</th>
                  <th>AR Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const status = asset.arData?.status || 'Active';
                  const alignments = asset.arData?.alignments || 'Pending';
                  const fileName = asset.model_3dUrl?.split('/').pop() || 'Unknown File';

                  return (
                    <tr key={asset.docId}>
                      <td className="font-mono text-sm">{asset.docId.substring(0, 8)}...</td>
                      <td className="font-medium">{asset.name}</td>
                      <td className="text-secondary" title={fileName}>
                        <div style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {fileName}
                        </div>
                      </td>
                      <td>
                        <span className={`align-status ${alignments.toLowerCase()}`}>
                          {alignments === 'Verified' && <Check size={14} />}
                          {alignments === 'Pending' && <Settings size={14} />}
                          {alignments === 'Failed' && <Crosshair size={14} />}
                          {alignments}
                        </span>
                      </td>
                      <td>
                        <label className="toggle-switch" aria-label="Toggle AR asset status">
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
                          <button className="btn-outline small" onClick={() => setPreviewAssetUrl(asset.model_3dUrl)}>
                            Preview
                          </button>
                          <button 
                            className="btn-outline small text-danger" 
                            onClick={async () => {
                              try {
                                await updateProduct(asset.docId, { model_3dUrl: null });
                                toast.success('Asset unlinked from product');
                              } catch (e) {
                                toast.error('Failed to unlink asset');
                              }
                            }}
                          >
                            Unlink
                          </button>
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
                👉 Click &quot;Link to Product&quot; to assign to {window._targetProduct.name}
              </span>
            )}
          </p>
          <div className="table-container">
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
                {globalLibrary.map((item) => {
                  // ar_assets has no name/type/timestamp columns -- derived
                  // from model_url (via toCamel: item.modelUrl) instead.
                  const fileName = item.modelUrl?.split('/').pop() || 'Untitled asset';
                  const isModel = item.modelUrl?.toLowerCase().endsWith('.glb');
                  const assetLabel = isModel ? '3D Model' : 'Segmentation Mask';
                  const usage = assets.filter(p => p.model_3dUrl === item.modelUrl || p.maskUrl === item.modelUrl).length;
                  return (
                    <tr key={item.id}>
                      <td className="font-medium">{fileName}</td>
                      <td>{assetLabel}</td>
                      <td className="text-secondary">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}</td>
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
                                const updateData = isModel
                                  ? { model_3dUrl: item.modelUrl, arData: { ...(window._targetProduct.arData || {}), status: 'Active' } }
                                  : { maskUrl: item.modelUrl };
                                await updateProduct(window._targetProduct.docId, updateData);
                                toast.success(`Linked ${fileName} to ${window._targetProduct.name}`);
                                window._targetProduct = null;
                                setActiveTab('assets');
                              }}
                            >
                              Link to Product
                            </button>
                          ) : (
                            <button className="btn-outline small" onClick={() => setPreviewAssetUrl(item.modelUrl)}>
                              Preview
                            </button>
                          )}
                          <button className="btn-outline small text-danger" onClick={() => {
                            if (usage > 0) {
                              toast.error('Cannot delete this asset. You must unlink it from all products first.');
                            } else {
                              setDeleteAssetConfirm(item);
                            }
                          }}>
                            Delete
                          </button>
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
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteAssetConfirm}
        title="Delete AR Asset"
        message={`Are you sure you want to delete this asset from the global library? This cannot be undone and will break any products linked to it.`}
        confirmText="Delete Asset"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={executeDeleteAsset}
        onCancel={() => setDeleteAssetConfirm(null)}
      />

      {/* Preview Asset Modal */}
      
      {/* Upload AR Asset Modal */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 420}}>
            <div className="modal-header">
              <h2>Upload AR Asset</h2>
              <button className="close-btn" onClick={() => setIsUploadModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="text-secondary text-sm mb-3">Upload a 3D model file (.glb, .gltf) for AR Try-On.</p>
              <div className="upload-dropzone" style={{border: '2px dashed #ccc', padding: '30px', textAlign: 'center', borderRadius: '8px', cursor: 'pointer', background: '#fafafa', position: 'relative'}}>
                <input type="file" id="ar-upload" accept=".glb,.gltf,image/*" style={{opacity: 0, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', cursor: 'pointer'}} onChange={e => setSelectedFile(e.target.files[0])} />
                <div style={{pointerEvents: 'none'}}>
                  {selectedFile ? (
                    <div className="flex-center gap-2 text-success" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                      <span className="font-medium">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Click to upload 3D model or image</p>
                      <span className="text-xs text-secondary mt-1">Supports .glb, .gltf, .png, .jpg</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => { setIsUploadModalOpen(false); setSelectedFile(null); }}>Cancel</button>
              <button className="btn-primary" onClick={handleUploadARAsset} disabled={isUploading || !selectedFile}>
                {isUploading ? 'Uploading...' : 'Upload Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup AR Link Modal */}
      {isLinkModalOpen && (
        <div className="modal-overlay" onClick={() => { setIsLinkModalOpen(false); setProductToLink(null); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Setup AR for {productToLink?.name}</h2>
              <button className="close-btn" onClick={() => { setIsLinkModalOpen(false); setProductToLink(null); }}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="mb-4">Select an existing asset from the Global Library, or upload a new one specifically for this product.</p>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" onClick={() => {
                  window._targetProduct = productToLink;
                  setIsLinkModalOpen(false);
                  setIsUploadModalOpen(true);
                }}>
                  Upload New Asset
                </button>
                <button className="btn-outline flex-1" onClick={() => {
                  window._targetProduct = productToLink;
                  setIsLinkModalOpen(false);
                  setActiveTab('library');
                }}>
                  Pick from Library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewAssetUrl && (
        <div className="modal-overlay" role="presentation" onClick={() => setPreviewAssetUrl(null)}>
          <div className="modal-content modal-lg" role="presentation" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Preview AR Asset</h2>
              <button className="close-btn" onClick={() => setPreviewAssetUrl(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ height: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#e8e8e8', borderRadius: '8px', position: 'relative' }}>
              {previewAssetUrl.toLowerCase().endsWith('.glb') || previewAssetUrl.toLowerCase().endsWith('.gltf') ? (
                <model-viewer
                  src={previewAssetUrl}
                  auto-rotate
                  camera-controls
                  style={{ width: '100%', height: '100%', minHeight: '400px' }}
                  environment-image="neutral"
                  shadow-intensity="1"
                ></model-viewer>
              ) : (
                <img src={previewAssetUrl} alt="Asset Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}
            </div>
          </div>
        </div>
      )}

      {ingestionData && (
        <GarmentIngestionModal
          productId={ingestionData.productId}
          category={ingestionData.category}
          glbUrl={ingestionData.glbUrl}
          existingMetadata={ingestionData.existingMetadata}
          onComplete={handleIngestionComplete}
          onCancel={() => setIngestionData(null)}
        />
      )}
    </div>
  );
};
export default ARAssets;
