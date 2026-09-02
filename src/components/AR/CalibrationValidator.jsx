 
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { calculateBoneRotations } from '../../utils/skeletalRetargeter';

const LANDMARK_INDICES = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
};

function buildSyntheticLandmarks(angles) {
  const lm = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  
  // MediaPipe: X right (subject left is +X), Y down, Z forward
  const ls = { x: 0.2, y: -0.5, z: 0 };
  const rs = { x: -0.2, y: -0.5, z: 0 };
  const lh = { x: 0.1, y: 0, z: 0 };
  const rh = { x: -0.1, y: 0, z: 0 };
  
  lm[LANDMARK_INDICES.LEFT_SHOULDER] = { ...ls, visibility: 1 };
  lm[LANDMARK_INDICES.RIGHT_SHOULDER] = { ...rs, visibility: 1 };
  lm[LANDMARK_INDICES.LEFT_HIP] = { ...lh, visibility: 1 };
  lm[LANDMARK_INDICES.RIGHT_HIP] = { ...rh, visibility: 1 };

  const upperLen = 0.25;
  const lowerLen = 0.25;

  // Left Arm (Angles from body: 0 = down, 90 = out/horizontal, 180 = up)
  const laRad = angles.leftArm * Math.PI / 180;
  // X goes positive for left arm going out
  const le = {
    x: ls.x + Math.sin(laRad) * upperLen,
    y: ls.y + Math.cos(laRad) * upperLen,
    z: ls.z
  };
  lm[LANDMARK_INDICES.LEFT_ELBOW] = { ...le, visibility: 1 };

  // Left Forearm (Angles relative to upper arm: 0 = straight, 90 = bent forward/up)
  const lfaRad = angles.leftForearm * Math.PI / 180;
  // If we just bend it "forward" (Z axis)
  const lw = {
    x: le.x + Math.sin(laRad) * lowerLen * Math.cos(lfaRad),
    y: le.y + Math.cos(laRad) * lowerLen * Math.cos(lfaRad),
    z: le.z - Math.sin(lfaRad) * lowerLen
  };
  lm[LANDMARK_INDICES.LEFT_WRIST] = { ...lw, visibility: 1 };

  // Right Arm
  const raRad = angles.rightArm * Math.PI / 180;
  // X goes negative for right arm going out
  const re = {
    x: rs.x - Math.sin(raRad) * upperLen,
    y: rs.y + Math.cos(raRad) * upperLen,
    z: rs.z
  };
  lm[LANDMARK_INDICES.RIGHT_ELBOW] = { ...re, visibility: 1 };

  const rfaRad = angles.rightForearm * Math.PI / 180;
  const rw = {
    x: re.x - Math.sin(raRad) * lowerLen * Math.cos(rfaRad),
    y: re.y + Math.cos(raRad) * lowerLen * Math.cos(rfaRad),
    z: re.z - Math.sin(rfaRad) * lowerLen
  };
  lm[LANDMARK_INDICES.RIGHT_WRIST] = { ...rw, visibility: 1 };

  return lm;
}

export default function CalibrationValidator({ glbUrl, metadata, onPass, onFail }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const bonesRef = useRef({});
  
  const [angles, setAngles] = useState({
    leftArm: 90, // T-Pose
    rightArm: 90,
    leftForearm: 0,
    rightForearm: 0,
  });

  const applyPreset = (preset) => {
    switch (preset) {
      case 'T_POSE': setAngles({ leftArm: 90, rightArm: 90, leftForearm: 0, rightForearm: 0 }); break;
      case 'A_POSE': setAngles({ leftArm: 55, rightArm: 55, leftForearm: 0, rightForearm: 0 }); break;
      case 'ARMS_UP': setAngles({ leftArm: 170, rightArm: 170, leftForearm: 0, rightForearm: 0 }); break;
      case 'ARMS_DOWN': setAngles({ leftArm: 10, rightArm: 10, leftForearm: 0, rightForearm: 0 }); break;
      case 'CROSSED': setAngles({ leftArm: 70, rightArm: 70, leftForearm: 90, rightForearm: 90 }); break;
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);

    const light = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(light);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, 5, 5);
    scene.add(dirLight);

    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
      scene.add(gltf.scene);
      
      const bones = {};
      gltf.scene.traverse(c => {
        if (c.isBone) {
           bones[c.name] = c;
           // Reset transform to world origin to apply raw world quaternions easily
           // actually we just let SkeletalRetargeter do its thing
        }
      });
      bonesRef.current = bones;

      const box = new THREE.Box3().setFromObject(gltf.scene);
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.x = -center.x;
      gltf.scene.position.z = -center.z;
    });

    sceneRef.current = { scene, camera, renderer, controls };

    let req;
    const animate = () => {
      req = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(req);
      renderer.dispose();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [glbUrl]);

  useEffect(() => {
    const lm = buildSyntheticLandmarks(angles);
    const rotations = calculateBoneRotations(lm, metadata.restPose);
    
    const bones = bonesRef.current;
    const boneMap = metadata.boneMap;

    for (const [canonicalName, quat] of Object.entries(rotations)) {
      const glbBoneName = boneMap[canonicalName];
      if (glbBoneName && bones[glbBoneName]) {
        // SkeletalRetargeter currently returns world-space orientations 
        // that match the T-pose definition of the canonical rig.
        const targetQ = new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w);
        bones[glbBoneName].quaternion.copy(targetQ);
      }
    }
  }, [angles, metadata]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button onClick={() => applyPreset('T_POSE')} className="btn-primary small">T-Pose</button>
        <button onClick={() => applyPreset('A_POSE')} className="btn-primary small">A-Pose</button>
        <button onClick={() => applyPreset('ARMS_UP')} className="btn-primary small">Arms Up</button>
        <button onClick={() => applyPreset('ARMS_DOWN')} className="btn-primary small">Neutral</button>
        <button onClick={() => applyPreset('CROSSED')} className="btn-primary small">Crossed</button>
      </div>

      <div className="flex gap-4">
        {/* Render Canvas */}
        <div ref={containerRef} className="flex-1 border rounded-lg overflow-hidden bg-gray-100" />
        
        {/* Sliders */}
        <div className="w-64 space-y-4 bg-gray-50 p-4 rounded-lg">
          <div>
            <label className="text-xs font-bold block">Left Arm (Pitch)</label>
            <input type="range" min="0" max="180" value={angles.leftArm} onChange={e => setAngles(a => ({...a, leftArm: Number(e.target.value)}))} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-bold block">Right Arm (Pitch)</label>
            <input type="range" min="0" max="180" value={angles.rightArm} onChange={e => setAngles(a => ({...a, rightArm: Number(e.target.value)}))} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-bold block">Left Forearm (Bend)</label>
            <input type="range" min="0" max="140" value={angles.leftForearm} onChange={e => setAngles(a => ({...a, leftForearm: Number(e.target.value)}))} className="w-full" />
          </div>
          <div>
            <label className="text-xs font-bold block">Right Forearm (Bend)</label>
            <input type="range" min="0" max="140" value={angles.rightForearm} onChange={e => setAngles(a => ({...a, rightForearm: Number(e.target.value)}))} className="w-full" />
          </div>

          <div className="pt-4 border-t mt-4 flex flex-col gap-2">
            <h4 className="font-bold text-gray-800 text-sm">Automated Quality Check</h4>
            {metadata.validationErrors && metadata.validationErrors.length > 0 ? (
              <div className="bg-red-50 text-red-700 p-2 rounded text-xs border border-red-200">
                <strong>Failed:</strong>
                <ul className="list-disc pl-4 mt-1">
                  {metadata.validationErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            ) : (
              <div className="bg-green-50 text-green-700 p-2 rounded text-xs border border-green-200">
                ✓ Passed all technical checks.
              </div>
            )}
            
            {metadata.validationWarnings && metadata.validationWarnings.length > 0 && (
              <div className="bg-yellow-50 text-yellow-700 p-2 rounded text-xs border border-yellow-200 mt-1">
                <strong>Warnings:</strong>
                <ul className="list-disc pl-4 mt-1">
                  {metadata.validationWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            
            <button 
              onClick={onPass} 
              className="mt-2 bg-green-600 text-white font-bold py-2 rounded text-center disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={metadata.validationErrors?.length > 0}
            >
              Confirm AR Ready
            </button>
            <button onClick={onFail} className="btn-secondary">
              Reject / Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
