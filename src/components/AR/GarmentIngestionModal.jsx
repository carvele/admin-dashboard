import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { GarmentIngestor } from '../../utils/garmentIngestor';
import '@google/model-viewer';

const STANDARD_BONES = [
  'Spine', 'Spine1', 'Spine2',
  'LeftShoulder', 'LeftArm', 'LeftForeArm',
  'RightShoulder', 'RightArm', 'RightForeArm',
];

export default function GarmentIngestionModal({ productId, category, glbUrl, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [availableBones, setAvailableBones] = useState([]);

  useEffect(() => {
    let isMounted = true;
    GarmentIngestor.analyzeGLBFromUrl(productId, category, glbUrl)
      .then((result) => {
        if (!isMounted) return;
        setMetadata(result);
        
        // Extract available bones by loading again or we can just pass availableBones from Ingestor.
        // Actually, we can fetch the glb again here just for bone list, or we could have Ingestor return it.
        // For now, let's just use the ones mapped or we can do a quick fetch to get all bones.
        fetchBones(glbUrl).then(bones => {
          if (isMounted) setAvailableBones(bones);
        });

        if (result.ingestionStatus === 'NOT_AR_COMPATIBLE') {
          setError('Model is not AR compatible. It must be a rigged/skinned mesh.');
          setLoading(false);
        } else if (result.ingestionStatus === 'NEEDS_MERCHANT_MAPPING') {
          setStep(2);
          setLoading(false);
        } else {
          setStep(3);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to analyze GLB');
          setLoading(false);
        }
      });
    return () => { isMounted = false; };
  }, [productId, category, glbUrl]);

  const fetchBones = async (url) => {
    return new Promise((resolve) => {
      import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
        new GLTFLoader().load(url, (gltf) => {
          const bones = [];
          gltf.scene.traverse((c) => { if (c.isBone) bones.push(c.name); });
          resolve(bones);
        });
      });
    });
  };

  const handleBoneMapChange = (stdBone, glbBone) => {
    setMetadata(prev => {
      const newBoneMap = { ...prev.boneMap };
      if (glbBone) newBoneMap[stdBone] = glbBone;
      else delete newBoneMap[stdBone];
      return { ...prev, boneMap: newBoneMap };
    });
  };

  const handleContinueFromMapping = () => {
    const hasRequired = metadata.boneMap['Spine'] && metadata.boneMap['LeftArm'] && metadata.boneMap['RightArm'];
    if (!hasRequired) {
      alert("Spine, LeftArm, and RightArm are required.");
      return;
    }
    setStep(3);
  };

  const handleSave = () => {
    // If we're here, we force AR_READY and mark merchant_confirmed if they adjusted anything
    // or just let them confirm inferred.
    const finalMetadata = {
      ...metadata,
      ingestionStatus: 'AR_READY',
      anchorConfidence: metadata.anchorConfidence === 'inferred' ? 'merchant_confirmed' : metadata.anchorConfidence
    };
    onComplete(finalMetadata);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white p-6 rounded-lg w-96 flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <h2 className="text-xl font-bold">Analyzing 3D Model...</h2>
          <p className="text-gray-500 mt-2">Checking skeleton and calibration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">AR Calibration</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-black">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error ? (
            <div className="text-center py-10">
              <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
              <h3 className="text-xl font-bold mb-2">Ingestion Failed</h3>
              <p className="text-gray-600 mb-6">{error}</p>
              <button onClick={onCancel} className="bg-gray-200 px-4 py-2 rounded">Close</button>
            </div>
          ) : step === 2 ? (
            <div>
              <h3 className="text-lg font-bold mb-4">Bone Mapping Required</h3>
              <p className="mb-4 text-gray-600">We couldn't automatically match all required bones. Please map them manually.</p>
              
              <div className="grid grid-cols-2 gap-4">
                {STANDARD_BONES.map(stdBone => (
                  <div key={stdBone} className="flex flex-col">
                    <label className="text-sm font-bold mb-1">
                      {stdBone} {['Spine', 'LeftArm', 'RightArm'].includes(stdBone) && <span className="text-red-500">*</span>}
                    </label>
                    <select
                      className="border rounded p-2"
                      value={metadata.boneMap[stdBone] || ''}
                      onChange={(e) => handleBoneMapChange(stdBone, e.target.value)}
                    >
                      <option value="">-- Select Bone --</option>
                      {availableBones.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleContinueFromMapping}
                  className="bg-primary text-white px-6 py-2 rounded flex items-center"
                >
                  Continue <ArrowRight size={16} className="ml-2" />
                </button>
              </div>
            </div>
          ) : step === 3 ? (
            <div className="flex gap-6 h-[500px]">
              <div className="flex-1 bg-gray-100 rounded-lg relative overflow-hidden">
                <model-viewer
                  src={glbUrl}
                  auto-rotate
                  camera-controls
                  ar
                  style={{ width: '100%', height: '100%' }}
                >
                  <button 
                    className="absolute bg-blue-500 w-4 h-4 rounded-full border-2 border-white shadow transform -translate-x-1/2 -translate-y-1/2"
                    slot="hotspot-anchor"
                    data-position={`${metadata.anatomicalAnchorOffset.x} ${metadata.anatomicalAnchorOffset.y} ${metadata.anatomicalAnchorOffset.z}`}
                    data-normal="0 0 1"
                  ></button>
                </model-viewer>
                <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded shadow text-xs font-bold">
                  Anchor: {metadata.anchorConfidence}
                </div>
              </div>
              <div className="w-80 flex flex-col gap-4">
                <h3 className="text-lg font-bold">Confirm Calibration</h3>
                
                <div>
                  <label className="block text-sm font-bold mb-1">Rest Pose Metric Width (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded p-2"
                    value={metadata.restPoseMetricWidth.toFixed(3)}
                    onChange={(e) => setMetadata({...metadata, restPoseMetricWidth: parseFloat(e.target.value) || 0.4})}
                  />
                  <p className="text-xs text-gray-500 mt-1">Shoulder to shoulder distance in 3D units.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-1">Rest Pose Type</label>
                  <select
                    className="w-full border rounded p-2"
                    value={metadata.restPose}
                    onChange={(e) => setMetadata({...metadata, restPose: e.target.value})}
                  >
                    <option value="T_POSE">T-Pose (Arms horizontal)</option>
                    <option value="A_POSE">A-Pose (Arms angled down)</option>
                  </select>
                </div>

                <div className="mt-auto flex justify-end gap-2">
                  <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                  <button onClick={handleSave} className="bg-primary text-white px-6 py-2 rounded flex items-center">
                    <Check size={16} className="mr-2" /> Save & Enable AR
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
