import type { WorldLandmark } from './poseDetector';
import type { Quaternion } from '../types/pose';

/**
 * Normalizes a 3D vector.
 */
function normalize(v: { x: number; y: number; z: number }) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Computes a quaternion representing a rotation from vector A to vector B.
 * Equivalent to THREE.Quaternion().setFromUnitVectors(vFrom, vTo).
 */
export function setFromUnitVectors(vFrom: { x: number; y: number; z: number }, vTo: { x: number; y: number; z: number }): Quaternion {
  let r = vFrom.x * vTo.x + vFrom.y * vTo.y + vFrom.z * vTo.z + 1;
  let q = { x: 0, y: 0, z: 0, w: 0 };

  if (r < 1e-6) {
    r = 0;
    if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
      q = { x: -vFrom.y, y: vFrom.x, z: 0, w: r };
    } else {
      q = { x: 0, y: -vFrom.z, z: vFrom.y, w: r };
    }
  } else {
    q = {
      x: vFrom.y * vTo.z - vFrom.z * vTo.y,
      y: vFrom.z * vTo.x - vFrom.x * vTo.z,
      z: vFrom.x * vTo.y - vFrom.y * vTo.x,
      w: r
    };
  }
  
  // Normalize the quaternion
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len === 0) return { x: 0, y: 0, z: 0, w: 1 };
  
  return {
    x: q.x / len,
    y: q.y / len,
    z: q.z / len,
    w: q.w / len
  };
}

/**
 * Calculates local bone quaternions from MediaPipe world landmarks to feed into Three.js.
 * 
 * MediaPipe World Coordinate Handedness:
 * X right (subject's left is +X if facing camera)
 * Y down
 * Z forward (negative Z is closer to camera)
 * 
 * Three.js World Coordinate Handedness:
 * X right
 * Y up
 * Z towards viewer (+Z is out of screen).
 */
export function calculateBoneRotations(worldLandmarks: WorldLandmark[], restPose: 'T_POSE' | 'A_POSE' | 'CUSTOM' = 'T_POSE'): Record<string, Quaternion> {
  const boneRotations: Record<string, Quaternion> = {};
  
  if (!worldLandmarks || worldLandmarks.length < 33) return boneRotations;

  // MediaPipe Landmark Indices
  const LEFT_SHOULDER = 11;
  const RIGHT_SHOULDER = 12;
  const LEFT_ELBOW = 13;
  const RIGHT_ELBOW = 14;
  const LEFT_WRIST = 15;
  const RIGHT_WRIST = 16;
  const LEFT_HIP = 23;
  const RIGHT_HIP = 24;
  
  const lS = worldLandmarks[LEFT_SHOULDER];
  const lE = worldLandmarks[LEFT_ELBOW];
  const lW = worldLandmarks[LEFT_WRIST];
  const rS = worldLandmarks[RIGHT_SHOULDER];
  const rE = worldLandmarks[RIGHT_ELBOW];
  const rW = worldLandmarks[RIGHT_WRIST];
  const lH = worldLandmarks[LEFT_HIP];
  const rH = worldLandmarks[RIGHT_HIP];

  const hasVis = (p: WorldLandmark) => p && p.visibility > 0.3;

  // 1. SPINE (MidHip to MidShoulder)
  if (hasVis(lS) && hasVis(rS) && hasVis(lH) && hasVis(rH)) {
    const midHip = {
      x: (lH.x + rH.x) / 2,
      y: (lH.y + rH.y) / 2,
      z: (lH.z + rH.z) / 2
    };
    const midShoulder = {
      x: (lS.x + rS.x) / 2,
      y: (lS.y + rS.y) / 2,
      z: (lS.z + rS.z) / 2
    };

    const targetDir = normalize({
      x: midShoulder.x - midHip.x,
      y: -(midShoulder.y - midHip.y), // Convert Y down to Y up
      z: -(midShoulder.z - midHip.z)  // Convert Z
    });

    // Assume T-Pose rest direction for Spine points perfectly UP (+Y)
    const restDir = { x: 0, y: 1, z: 0 };
    boneRotations['Spine'] = setFromUnitVectors(restDir, targetDir);
    // Many rigs have multiple spine joints, map the primary one
    boneRotations['Spine1'] = boneRotations['Spine'];
    boneRotations['Spine2'] = boneRotations['Spine'];
  }

  // 2. LEFT UPPER ARM (LeftShoulder to LeftElbow)
  if (hasVis(lS) && hasVis(lE)) {
    const targetDir = normalize({
      x: lE.x - lS.x,
      y: -(lE.y - lS.y),
      z: -(lE.z - lS.z)
    });
        // Left Arm Rest Direction
    let restDir = { x: 1, y: 0, z: 0 };
    if (restPose === 'A_POSE') {
      const angle = 35 * Math.PI / 180;
      restDir = { x: Math.cos(angle), y: -Math.sin(angle), z: 0 };
    }
    boneRotations['LeftArm'] = setFromUnitVectors(restDir, targetDir);
  }

  // 3. LEFT FOREARM (LeftElbow to LeftWrist)
  if (hasVis(lE) && hasVis(lW)) {
    const targetDir = normalize({
      x: lW.x - lE.x,
      y: -(lW.y - lE.y),
      z: -(lW.z - lE.z)
    });
        // Left Arm Rest Direction
    let restDir = { x: 1, y: 0, z: 0 };
    if (restPose === 'A_POSE') {
      const angle = 35 * Math.PI / 180;
      restDir = { x: Math.cos(angle), y: -Math.sin(angle), z: 0 };
    }
    boneRotations['LeftForeArm'] = setFromUnitVectors(restDir, targetDir);
  }

  // 4. RIGHT UPPER ARM (RightShoulder to RightElbow)
  if (hasVis(rS) && hasVis(rE)) {
    const targetDir = normalize({
      x: rE.x - rS.x,
      y: -(rE.y - rS.y),
      z: -(rE.z - rS.z)
    });
        // Right Arm Rest Direction
    let restDir = { x: -1, y: 0, z: 0 };
    if (restPose === 'A_POSE') {
      const angle = 35 * Math.PI / 180;
      restDir = { x: -Math.cos(angle), y: -Math.sin(angle), z: 0 };
    }
    boneRotations['RightArm'] = setFromUnitVectors(restDir, targetDir);
  }

  // 5. RIGHT FOREARM (RightElbow to RightWrist)
  if (hasVis(rE) && hasVis(rW)) {
    const targetDir = normalize({
      x: rW.x - rE.x,
      y: -(rW.y - rE.y),
      z: -(rW.z - rE.z)
    });
        // Right Arm Rest Direction
    let restDir = { x: -1, y: 0, z: 0 };
    if (restPose === 'A_POSE') {
      const angle = 35 * Math.PI / 180;
      restDir = { x: -Math.cos(angle), y: -Math.sin(angle), z: 0 };
    }
    boneRotations['RightForeArm'] = setFromUnitVectors(restDir, targetDir);
  }

  return boneRotations;
}
