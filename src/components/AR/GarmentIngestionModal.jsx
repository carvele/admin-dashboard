/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, ArrowRight, Info, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { GarmentIngestor } from '../../utils/garmentIngestor';
import CalibrationValidator from './CalibrationValidator';
import '@google/model-viewer';

const STANDARD_BONES = [
  'Spine', 'Spine1', 'Spine2',
  'LeftShoulder', 'LeftArm', 'LeftForeArm',
  'RightShoulder', 'RightArm', 'RightForeArm',
];

const REQUIRED_BONES = ['Spine', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];

const ANCHOR_CONFIDENCE_LABELS = {
  HIGH: { label: 'High Confidence', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  MEDIUM: { label: 'Medium Confidence', color: 'bg-yellow-100 text-yellow-800', icon: HelpCircle },
  LOW: { label: 'Low Confidence (Please check)', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
  MERCHANT_CONFIRMED: { label: 'Merchant confirmed', color: 'bg-blue-100 text-blue-800', icon: CheckCircle2 },
  // Legacy
  detected: { label: 'Auto-detected', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  inferred: { label: 'Inferred (needs confirmation)', color: 'bg-yellow-100 text-yellow-800', icon: HelpCircle },
  merchant_confirmed: { label: 'Merchant confirmed', color: 'bg-blue-100 text-blue-800', icon: CheckCircle2 },
};

const STATUS_LABELS = {
  AR_READY: { label: 'AR Ready', desc: 'No action required. This garment is ready for AR try-on.', color: 'bg-green-50 border-green-200 text-green-800', icon: CheckCircle2 },
  NEEDS_MERCHANT_MAPPING: { label: 'Bone Mapping Required', desc: 'Please select/map the missing bones.', color: 'bg-yellow-50 border-yellow-200 text-yellow-800', icon: AlertTriangle },
  NEEDS_CALIBRATION: { label: 'Calibration Required', desc: 'Auto-rigging successful. Please confirm calibration.', color: 'bg-blue-50 border-blue-200 text-blue-800', icon: Info },
  NOT_AR_COMPATIBLE: { label: 'Not AR Compatible', desc: 'This GLB does not meet geometry requirements.', color: 'bg-red-50 border-red-200 text-red-800', icon: XCircle },
};

export default function GarmentIngestionModal({ productId, category, glbUrl, existingMetadata, onComplete, onCancel }) {
  const [step, setStep] = useState(1); // 1=loading, 2=bone mapping, 3=calibration preview
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [availableBones, setAvailableBones] = useState([]);
  const [totalBoneCount, setTotalBoneCount] = useState(0);
  const [riggedBlob, setRiggedBlob] = useState(null);
  const [riggedUrl, setRiggedUrl] = useState(null);

  useEffect(() => {
    let isMounted = true;
    GarmentIngestor.analyzeGLBFromUrl(productId, category, glbUrl)
      .then((result) => {
        if (!isMounted) return;
        let { metadata: md, riggedGlbUrl, riggedGlbBlob } = result;
        
        // Merge with existing metadata to prevent resetting manual configurations (e.g. restPoseMetricWidth)
        if (existingMetadata) {
          const toCamelCase = (s) => s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
          const normalizedExisting = {};
          for (const [key, value] of Object.entries(existingMetadata)) {
            normalizedExisting[toCamelCase(key)] = value;
          }
          if (normalizedExisting.boneMap) {
            const canonicalBoneMap = {};
            for (const [glbBone, canonical] of Object.entries(normalizedExisting.boneMap)) {
              if (canonical) canonicalBoneMap[canonical] = glbBone;
            }
            normalizedExisting.boneMap = canonicalBoneMap;
          }
          md = { ...md, ...normalizedExisting, ingestionStatus: normalizedExisting.ingestionStatus || md.ingestionStatus };
        }

        setMetadata(md);
        if (riggedGlbUrl) setRiggedUrl(riggedGlbUrl);
        if (riggedGlbBlob) setRiggedBlob(riggedGlbBlob);
        
        fetchBones(glbUrl).then(bones => {
          if (!isMounted) return;
          // If auto-rigged, fetchBones will return the old unrigged bones.
          // But that's okay, because mapping is skipped for auto-rigged.
          setAvailableBones(bones);
          setTotalBoneCount(bones.length);
        });

        if (md.ingestionStatus === 'NOT_AR_COMPATIBLE') {
          setError('Model is not AR compatible. It must meet minimal geometry requirements.');
          setLoading(false);
        } else if (md.ingestionStatus === 'NEEDS_MERCHANT_MAPPING') {
          const hasRequired = REQUIRED_BONES.every(b => md.boneMap[b]);
          setStep(hasRequired ? 3 : 2);
          setLoading(false);
        } else if (md.ingestionStatus === 'NEEDS_CALIBRATION') {
          setStep(3);
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
        }, undefined, () => resolve([]));
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
    const hasRequired = REQUIRED_BONES.every(b => metadata.boneMap[b]);
    if (!hasRequired) {
      alert('Spine, LeftArm, RightArm, LeftForeArm, and RightForeArm are required.');
      return;
    }
    setStep(3);
  };

  const handleSave = () => {
    const finalStatus = 'AR_READY';

    const finalMetadata = {
      ...metadata,
      ingestionStatus: finalStatus,
      anchorConfidence: metadata.anchorConfidence === 'inferred' ? 'MERCHANT_CONFIRMED' : metadata.anchorConfidence
    };
    onComplete({ metadata: finalMetadata, riggedBlob });
  };

  const mappedCount = metadata ? Object.keys(metadata.boneMap).length : 0;
  const requiredMapped = metadata ? REQUIRED_BONES.filter(b => metadata.boneMap[b]).length : 0;

  // ── Loading screen ──
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white p-8 rounded-lg w-96 flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <h2 className="text-xl font-bold">Analyzing 3D Model...</h2>
          <p className="text-gray-500 mt-2">Checking skeleton, bones, and calibration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* ── Header ── */}
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">AR Calibration</h2>
            {metadata && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                Step {step === 2 ? '1' : '2'} of 2 — {step === 2 ? 'Bone Mapping' : 'Calibration Preview'}
              </span>
            )}
          </div>
          <button onClick={onCancel} className="btn-outline small">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">

          {/* ── Error state ── */}
          {error ? (
            <div className="text-center py-10">
              <XCircle size={48} className="mx-auto text-red-500 mb-4" />
              <h3 className="text-xl font-bold mb-2">Not AR Compatible</h3>
              <p className="text-gray-600 mb-2">{error}</p>
              <p className="text-sm text-gray-400 mb-6">
                This GLB must contain recognizable 3D geometry for a garment, 
                such as a shirt, dress, or pants.
              </p>
              <button onClick={onCancel} className="btn-secondary">Close</button>
            </div>

          /* ── Step 2: Bone Mapping ── */
          ) : step === 2 ? (
            <div>
              {/* Status banner */}
              <div className="mb-4 p-3 rounded border bg-yellow-50 border-yellow-200 flex items-start gap-3">
                <AlertTriangle size={20} className="text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-yellow-800">Calibration Required</p>
                  <p className="text-sm text-yellow-700">
                    We couldn&apos;t automatically match all required bones. 
                    Map at least <strong>Spine</strong>, <strong>LeftArm</strong>, <strong>RightArm</strong>, <strong>LeftForeArm</strong>, and <strong>RightForeArm</strong> to continue.
                  </p>
                </div>
              </div>

              <div className="flex gap-6">
                {/* Bone mapping table */}
                <div className="flex-1">
                  <h4 className="text-sm font-bold mb-3 text-gray-700">Canonical Bone → GLB Bone</h4>
                  <div className="space-y-2">
                    {STANDARD_BONES.map(stdBone => {
                      const isMapped = !!metadata.boneMap[stdBone];
                      const isRequired = REQUIRED_BONES.includes(stdBone);
                      return (
                        <div key={stdBone} className="flex items-center gap-2">
                          <div className="w-5">
                            {isMapped ? (
                              <CheckCircle2 size={16} className="text-green-500" />
                            ) : isRequired ? (
                              <XCircle size={16} className="text-red-400" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                            )}
                          </div>
                          <label className="text-sm font-medium w-32 shrink-0">
                            {stdBone}
                            {isRequired && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          <select autoComplete="off" id="field_e2fl178" name="field_e2fl178"
                            className="flex-1 border rounded p-1.5 text-sm"
                            value={metadata.boneMap[stdBone] || ''}
                            onChange={(e) => handleBoneMapChange(stdBone, e.target.value)}
                          >
                            <option value="">— unmapped —</option>
                            {availableBones.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* GLB bones list */}
                <div className="w-56 bg-gray-50 rounded-lg p-3 overflow-y-auto max-h-80">
                  <h4 className="text-xs font-bold text-gray-500 mb-2 uppercase">
                    All GLB Bones ({totalBoneCount})
                  </h4>
                  <div className="space-y-0.5">
                    {availableBones.map(b => {
                      const isUsed = Object.values(metadata.boneMap).includes(b);
                      return (
                        <div key={b} className={`text-xs px-1.5 py-0.5 rounded ${isUsed ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-600'}`}>
                          {b} {isUsed && '✓'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  {requiredMapped}/5 required bones mapped — {mappedCount}/{STANDARD_BONES.length} total
                </p>
                <button
                  onClick={handleContinueFromMapping}
                  disabled={requiredMapped < 5}
                  className="bg-primary text-white px-6 py-2 rounded flex items-center disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue <ArrowRight size={16} className="ml-2" />
                </button>
              </div>
            </div>

          /* ── Step 3: Calibration Preview ── */
          ) : step === 3 ? (
            <div>
              {/* Status banner */}
              {(() => {
                const st = STATUS_LABELS[metadata.ingestionStatus] || STATUS_LABELS.AR_READY;
                const Icon = st.icon;
                return (
                  <div className={`mb-4 p-3 rounded border flex items-start gap-3 ${st.color}`}>
                    <Icon size={20} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">{st.label}</p>
                      <p className="text-sm opacity-80">{st.desc}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-6" style={{ minHeight: 480 }}>
                {/* 3D Preview */}
                <div className="flex-1 bg-gray-100 rounded-lg relative overflow-hidden">
                  <model-viewer
                    key={glbUrl}
                    src={glbUrl}
                    auto-rotate
                    camera-controls
                    style={{ width: '100%', height: '100%' }}
                  >
                    {/* Anchor hotspot */}
                    <button 
                      className="absolute bg-blue-500 w-4 h-4 rounded-full border-2 border-white shadow"
                      slot="hotspot-anchor"
                      data-position={`${metadata.anatomicalAnchorOffset.x} ${metadata.anatomicalAnchorOffset.y} ${metadata.anatomicalAnchorOffset.z}`}
                      data-normal="0 0 1"
                      title="Anatomical Anchor"
                    ></button>
                  </model-viewer>

                  {/* Overlay badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {(() => {
                      const ac = ANCHOR_CONFIDENCE_LABELS[metadata.anchorConfidence] || ANCHOR_CONFIDENCE_LABELS.inferred;
                      const Icon = ac.icon;
                      return (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${ac.color}`}>
                          <Icon size={12} /> Anchor: {ac.label}
                        </span>
                      );
                    })()}
                    <span className="bg-white bg-opacity-90 px-2 py-0.5 rounded text-xs font-bold text-gray-700">
                      {metadata.restPose === 'T_POSE' ? '🤸 T-Pose' : '🧍 A-Pose'}
                    </span>
                  </div>
                </div>

                {/* Calibration panel */}
                <div className="w-80 flex flex-col gap-3 overflow-y-auto">
                  <h3 className="text-lg font-bold">Calibration Preview</h3>

                  {/* ── Detected measurements ── */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Detected Measurements</h4>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Shoulder width</span>
                        <span className="font-mono font-bold">{metadata.restPoseMetricWidth.toFixed(3)} m</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Anchor position</span>
                        <span className="font-mono text-xs">
                          ({metadata.anatomicalAnchorOffset.x.toFixed(2)}, {metadata.anatomicalAnchorOffset.y.toFixed(2)}, {metadata.anatomicalAnchorOffset.z.toFixed(2)})
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Category</span>
                        <span className="font-medium capitalize">{metadata.category}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Bone map summary ── */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">
                      Skeleton ({mappedCount}/{STANDARD_BONES.length} mapped)
                    </h4>
                    <div className="grid grid-cols-3 gap-1">
                      {STANDARD_BONES.map(b => {
                        const mapped = !!metadata.boneMap[b];
                        const required = REQUIRED_BONES.includes(b);
                        return (
                          <div
                            key={b}
                            className={`text-xs px-1.5 py-1 rounded text-center ${
                              mapped 
                                ? 'bg-green-100 text-green-700' 
                                : required 
                                  ? 'bg-red-100 text-red-600' 
                                  : 'bg-gray-200 text-gray-500'
                            }`}
                            title={mapped ? `${b} → ${metadata.boneMap[b]}` : `${b}: unmapped`}
                          >
                            {mapped ? '✓' : '✗'} {b.replace('Left', 'L').replace('Right', 'R')}
                          </div>
                        );
                      })}
                    </div>
                    {step === 3 && (
                      <button
                        onClick={() => setStep(2)}
                        className="text-xs text-primary underline mt-2"
                      >
                        Edit bone mapping
                      </button>
                    )}
                  </div>

                  {/* ── Editable fields ── */}
                  {/* Only Shoulder Width sets anchorConfidence: 'merchant_confirmed' below.
                      Rest Pose and Anchor Type used to set it too, which was wrong -- this
                      modal has no editable field for anatomicalAnchorOffset at all (it's
                      display-only above), so picking a rest pose or anchor type was
                      silently stamping the anchor position as human-reviewed when nobody
                      had looked at it. Confirmed live: two catalog products ended up with
                      merchant_confirmed anchor data that was actually never reviewed. */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-bold mb-1">Shoulder Width (m)</label>
                      <input autoComplete="off" id="field_qsptygk" name="field_qsptygk"
                        type="number"
                        step="0.01"
                        min="0.1"
                        max="1.0"
                        className="w-full border rounded p-2 text-sm font-mono"
                        value={metadata.restPoseMetricWidth.toFixed(3)}
                        onChange={(e) => setMetadata({
                          ...metadata,
                          restPoseMetricWidth: parseFloat(e.target.value) || 0.4,
                          anchorConfidence: 'merchant_confirmed'
                        })}
                      />
                      <p className="text-xs text-gray-400 mt-1">Measured from LeftShoulder bone to RightShoulder bone.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-bold mb-1">Rest Pose</label>
                      <select autoComplete="off" id="field_vhrqvae" name="field_vhrqvae"
                        className="w-full border rounded p-2 text-sm"
                        value={metadata.restPose}
                        onChange={(e) => setMetadata({
                          ...metadata,
                          restPose: e.target.value
                        })}
                      >
                        <option value="T_POSE">T-Pose - Arms horizontal</option>
                        <option value="A_POSE">A-Pose - Arms ~35° below horizontal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold mb-1">Anchor Type</label>
                      <select autoComplete="off" id="field_ee37b70" name="field_ee37b70"
                        className="w-full border rounded p-2 text-sm"
                        value={metadata.anchorType}
                        onChange={(e) => setMetadata({
                          ...metadata,
                          anchorType: e.target.value
                        })}
                      >
                        <option value="NECK">Neck</option>
                        <option value="SHOULDER_CENTER">Shoulder Center</option>
                        <option value="CHEST">Chest</option>
                        <option value="WAIST">Waist</option>
                        <option value="HIP">Hip</option>
                        <option value="CUSTOM">Custom</option>
                      </select>
                    </div>
                  </div>

                  {/* ── Actions ── */}
                  <div className="mt-auto pt-3 border-t flex justify-end gap-2">
                    <button
                      onClick={onCancel}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm"
                    >
                      Cancel
                    </button>
                    <button onClick={() => setStep(4)} className="btn-primary">Next: Validate AR Fit <ArrowRight size={16} className="ml-2" /></button>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 4 ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-4 border-b pb-4">
                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold">4</div>
                <div>
                  <h2 className="font-bold text-gray-800">Validate AR Deformation</h2>
                  <p className="text-sm text-gray-500">Ensure the garment deforms correctly before enabling it.</p>
                </div>
              </div>
              <div className="flex-1 min-h-[500px]">
                <CalibrationValidator 
                  glbUrl={riggedUrl || glbUrl} 
                  metadata={metadata} 
                  onPass={handleSave} 
                  onFail={() => {
                     setStep(3);
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
