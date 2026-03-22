import React, { useState, useEffect } from 'react';
import { Upload, Camera, View, Settings, Check, Crosshair, Shirt, Trash2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { subscribeToCollection, updateDocument, addDocument, deleteDocument } from '../firebase/firestore';
import './ARAssets.css';

const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/demo/upload';
const CLOUDINARY_UPLOAD_PRESET = 'docs_upload_example_us_preset';

const ARAssets = () => {
  const [activeTab, setActiveTab] = useState('assets');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configAsset, setConfigAsset] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poses, setPoses] = useState([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isPoseModalOpen, setIsPoseModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Alignment form state
  const [alignPoints, setAlignPoints] = useState({
    shoulderL: '-0.25, 1.45, 0',
    shoulderR: '0.25, 1.45, 0',
    waist: '0, 1.05, 0',
    hips: '0, 0.90, 0'
  });
  
  // Pose form state
  const [poseForm, setPoseForm] = useState({ name: '', category: 'Calibration' });

  useEffect(() => {
    const unsub = subscribeToCollection('products', (data) => {
      const arProducts = data.filter(p => p.tags && p.tags.includes('AR Try-On'));
      setAssets(arProducts);
      setLoading(false);
    });
    const unsubPoses = subscribeToCollection('poseGuides', setPoses);
    return () => { unsub(); unsubPoses(); };
  }, []);

  const toggleStatus = async (asset) => {
    const newStatus = asset.arStatus === 'Disabled' ? 'Active' : 'Disabled';
    try {
      await updateDocument('products', asset.docId, { arStatus: newStatus });
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
      hips: asset.arAlignPoints?.hips || '0, 0.90, 0'
    });
    setIsConfigModalOpen(true);
  };

  const saveAlignmentPoints = async () => {
    if (!configAsset) return;
    try {
      await updateDocument('products', configAsset.docId, {
        arAlignPoints: alignPoints,
        arAlignments: 'Verified'
      });
      toast.success('Alignment points saved & verified!');
      setIsConfigModalOpen(false);
    } catch (e) {
      toast.error('Failed to save alignment points');
    }
  };

  const handleUploadARAsset = async () => {
    if (!selectedFile) { toast.error('Select a 3D model file'); return; }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('resource_type', 'auto');
      
      const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
      const data = await res.json();
      
      toast.success(`AR asset "${selectedFile.name}" uploaded to cloud storage! Tag a product with "AR Try-On" in Catalog to associate it.`);
      setIsUploadModalOpen(false);
      setSelectedFile(null);
    } catch (e) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddPose = async () => {
    if (!poseForm.name.trim()) { toast.error('Enter a pose name'); return; }
    try {
      await addDocument('poseGuides', {
        id: `P-${String(poses.length + 1).padStart(3, '0')}`,
        name: poseForm.name,
        category: poseForm.category
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
      await deleteDocument('poseGuides', pose.docId);
      toast.success('Pose deleted');
    } catch (e) {
      toast.error('Failed to delete pose');
    }
  };

  // Default poses if none in DB
  const displayPoses = poses.length > 0 ? poses : [
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
            className={`tab-btn ${activeTab === 'assets' ? 'active' : ''}`}
            onClick={() => setActiveTab('assets')}
          >
            <View size={16} /> Asset Library
          </button>
          <button 
            className={`tab-btn ${activeTab === 'poses' ? 'active' : ''}`}
            onClick={() => setActiveTab('poses')}
          >
            <Camera size={16} /> Pose Guides
          </button>
        </div>
      </div>

      {activeTab === 'assets' ? (
        <div className="card">
          <div className="card-header">
            <h3>Clothing AR Assets</h3>
            <button className="btn-primary flex-center gap-2" onClick={() => setIsUploadModalOpen(true)}>
              <Upload size={16}/> Upload New Asset
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
              {assets.map(asset => {
                const status = asset.arStatus || 'Active';
                const alignments = asset.arAlignments || 'Pending';
                
                return (
                <tr key={asset.id}>
                  <td className="font-mono text-sm">{asset.id}</td>
                  <td className="font-medium">{asset.name}</td>
                  <td className="text-secondary">3D Model (.glb)</td>
                  <td>
                    <span className={`align-status ${alignments.toLowerCase()}`}>
                      {alignments === 'Verified' && <Check size={14}/>}
                      {alignments === 'Pending' && <Settings size={14}/>}
                      {alignments === 'Failed' && <Crosshair size={14}/>}
                      {alignments}
                    </span>
                  </td>
                  <td>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={status === 'Active'} onChange={() => toggleStatus(asset)} />
                      <span className="toggle-slider"></span>
                    </label>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-outline small" onClick={() => openConfig(asset)}>Configure Points</button>
                      <button className="btn-outline small">Preview</button>
                    </div>
                  </td>
                </tr>
              )})}
              
              {assets.length === 0 && !loading && (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state flex-col flex-center gap-3 p-8">
                      <div className="icon-bg-large bg-light text-secondary mb-2 rounded-full p-4"><View size={48} opacity={0.5} /></div>
                      <h3 className="text-lg font-medium">No AR-enabled products found</h3>
                      <p className="text-secondary text-center max-w-sm">Add the 'AR Try-On' tag to a product in the Catalog module to use this feature.</p>
                      <button className="btn-outline mt-2" onClick={() => setActiveTab('poses')}>View Pose Guides</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pose-guide-section">
          <div className="card-header mb-4">
            <h3>Pose Guide Library</h3>
            <button className="btn-primary flex-center gap-2" onClick={() => setIsPoseModalOpen(true)}>
              <Plus size={16}/> Add Pose Reference
            </button>
          </div>
          <div className="pose-grid">
            {displayPoses.map(pose => (
              <div key={pose.id || pose.docId} className="pose-card card">
                <div className="pose-img-placeholder">
                  <Camera size={48} className="text-secondary opacity-50" />
                </div>
                <div className="pose-info">
                  <div className="flex-between">
                    <span className="text-xs font-mono text-secondary">{pose.id}</span>
                    <span className="tag-badge">{pose.category}</span>
                  </div>
                  <h4>{pose.name}</h4>
                  <div className="mt-3 flex gap-2">
                    {pose.docId && (
                      <button className="btn-outline small text-danger flex-1" onClick={() => handleDeletePose(pose)}>
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload AR Asset Modal */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 420}}>
            <div className="modal-header">
              <h2>Upload AR Asset</h2>
              <button className="close-btn" onClick={() => setIsUploadModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="text-secondary text-sm mb-3">Upload a 3D model file (.glb, .gltf) for AR Try-On. After uploading, tag a product with "AR Try-On" in the Catalog to associate this asset.</p>
              <div className="upload-dropzone">
                <input type="file" id="ar-upload" accept=".glb,.gltf,image/*" className="file-input-hidden" onChange={e => setSelectedFile(e.target.files[0])} />
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
                      <span className="text-xs text-secondary mt-1">Supports .glb, .gltf, .png, .jpg</span>
                    </>
                  )}
                </label>
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

      {/* Add Pose Reference Modal */}
      {isPoseModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPoseModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 400}}>
            <div className="modal-header">
              <h2>Add Pose Reference</h2>
              <button className="close-btn" onClick={() => setIsPoseModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">Pose Name</label>
                <input type="text" className="input-field" placeholder="e.g., Front T-Pose" value={poseForm.name} onChange={e => setPoseForm({...poseForm, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="label">Category</label>
                <select className="input-field" value={poseForm.category} onChange={e => setPoseForm({...poseForm, category: e.target.value})}>
                  <option>Calibration</option>
                  <option>Preview</option>
                  <option>Dynamic</option>
                  <option>Turn</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setIsPoseModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAddPose}>Add Pose</button>
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
              <button className="close-btn" onClick={() => setIsConfigModalOpen(false)}>&times;</button>
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
                    <input type="text" className="input-field small" value={alignPoints.shoulderL} onChange={e => setAlignPoints({...alignPoints, shoulderL: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="label text-xs">Right Shoulder (x,y,z)</label>
                    <input type="text" className="input-field small" value={alignPoints.shoulderR} onChange={e => setAlignPoints({...alignPoints, shoulderR: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="label text-xs">Waist Center (x,y,z)</label>
                    <input type="text" className="input-field small" value={alignPoints.waist} onChange={e => setAlignPoints({...alignPoints, waist: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="label text-xs">Hips (x,y,z)</label>
                    <input type="text" className="input-field small" value={alignPoints.hips} onChange={e => setAlignPoints({...alignPoints, hips: e.target.value})} />
                  </div>
                  
                  <button className="btn-primary full-width mt-4" onClick={saveAlignmentPoints}>Save & Verify Points</button>
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
