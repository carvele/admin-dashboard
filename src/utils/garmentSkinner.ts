import * as THREE from 'three';
import type { AnatomyLandmarks } from './garmentAnatomyDetector';

export class GarmentSkinner {
  
  public static skin(mesh: THREE.SkinnedMesh, skeleton: THREE.Skeleton, anatomy: AnatomyLandmarks): void {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const vertexCount = position.count;
    
    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);

    // 1. Build bone segment data
    // We want to map each bone to a line segment in world space.
    // For leaf bones, we project a short distance along their local Y or Z.
    const boneSegments = skeleton.bones.map((bone) => {
      const start = new THREE.Vector3();
      bone.getWorldPosition(start);
      
      const end = new THREE.Vector3();
      if (bone.children.length > 0) {
        bone.children[0].getWorldPosition(end);
      } else {
        // Fallback for leaf bones (e.g. ForeArm if it has no child, or Spine2)
        end.copy(start);
        // We will treat zero-length segments as points.
      }
      return { bone, start, end, index: skeleton.bones.indexOf(bone) };
    });

    // Determine anatomical center/frame to isolate left/right without relying on raw coordinate values
    const leftShoulderPos = anatomy.leftShoulder?.position || new THREE.Vector3(0.1, 0, 0);
    const rightShoulderPos = anatomy.rightShoulder?.position || new THREE.Vector3(-0.1, 0, 0);

    // Temp variables for the hot loop
    const p = new THREE.Vector3();
    const influences: { index: number, weight: number }[] = [];

    // Pre-calculate canonical masking regions
    const isSleeveless = anatomy.sleeveType === 'SLEEVELESS';

    for (let i = 0; i < vertexCount; i++) {
      p.fromBufferAttribute(position, i);
      // Convert local vertex position to world space for distance checks
      p.applyMatrix4(mesh.matrixWorld);

      // Determine regional affiliation based on canonical frame
      const distToLeftShoulder = p.distanceToSquared(leftShoulderPos);
      const distToRightShoulder = p.distanceToSquared(rightShoulderPos);
      const isLeftHalf = distToLeftShoulder < distToRightShoulder;
      const isRightHalf = distToRightShoulder < distToLeftShoulder;

      influences.length = 0;

      for (const seg of boneSegments) {
        // Masking logic
        if (seg.bone.name.includes('Left') && isRightHalf) continue;
        if (seg.bone.name.includes('Right') && isLeftHalf) continue;

        const d2 = this.distToSegmentSquared(
          p.x, p.y, p.z,
          seg.start.x, seg.start.y, seg.start.z,
          seg.end.x, seg.end.y, seg.end.z
        );

        let weight = 0;
        if (d2 < 0.000001) {
          weight = 10000; // Almost exact match
        } else {
          weight = 1.0 / (d2 + 0.0001); // Inverse squared falloff
        }

        // Penalty for sleeveless stubs to prevent them dragging the torso
        if (isSleeveless && (seg.bone.name.includes('Arm') || seg.bone.name.includes('ForeArm'))) {
          // Sharp exponential decay
          weight *= Math.exp(-d2 * 50); 
        }

        influences.push({ index: seg.index, weight });
      }

      // Sort influences descending
      influences.sort((a, b) => b.weight - a.weight);

      // Keep top 4
      let sum = 0;
      for (let j = 0; j < 4; j++) {
        if (j < influences.length) {
          sum += influences[j].weight;
        }
      }

      // We do NOT fallback to Spine. If sum is 0, it remains 0 (and fails validation).
      if (sum > 0) {
        for (let j = 0; j < 4; j++) {
          if (j < influences.length) {
            skinIndices[i * 4 + j] = influences[j].index;
            skinWeights[i * 4 + j] = influences[j].weight / sum;
          } else {
            skinIndices[i * 4 + j] = 0;
            skinWeights[i * 4 + j] = 0;
          }
        }
      } else {
        // Unweighted vertex explicitly recorded as 0 weight to ensure validator catches it.
        skinIndices[i * 4] = 0; skinWeights[i * 4] = 0;
        skinIndices[i * 4 + 1] = 0; skinWeights[i * 4 + 1] = 0;
        skinIndices[i * 4 + 2] = 0; skinWeights[i * 4 + 2] = 0;
        skinIndices[i * 4 + 3] = 0; skinWeights[i * 4 + 3] = 0;
      }
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  }

  private static distToSegmentSquared(
    px: number, py: number, pz: number,
    vx: number, vy: number, vz: number,
    wx: number, wy: number, wz: number
  ): number {
    const l2 = (wx - vx) ** 2 + (wy - vy) ** 2 + (wz - vz) ** 2;
    if (l2 === 0) return (px - vx) ** 2 + (py - vy) ** 2 + (pz - vz) ** 2;
    
    let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy) + (pz - vz) * (wz - vz)) / l2;
    t = Math.max(0, Math.min(1, t));
    
    const projX = vx + t * (wx - vx);
    const projY = vy + t * (wy - vy);
    const projZ = vz + t * (wz - vz);
    
    return (px - projX) ** 2 + (py - projY) ** 2 + (pz - projZ) ** 2;
  }
}
