import * as THREE from 'three';

// Builds a plain (unrigged), roughly torso/shirt-shaped mesh: a tapered,
// segmented cylinder wide at the shoulders, narrower at the waist, wide
// again at the hem, with enough vertices and height bands for
// GarmentAnatomyDetector's 30-slice algorithm to produce real landmarks
// (its own minimum is 5 populated slices). Used across the ingestion test
// suite instead of loading a real GLB, so tests stay fast and offline.
export function buildSyntheticGarmentMesh(opts?: {
  heightUnits?: number;
  radialSegments?: number;
  heightSegments?: number;
}): THREE.Group {
  const height = opts?.heightUnits ?? 0.6;
  const radialSegments = opts?.radialSegments ?? 10;
  const heightSegments = opts?.heightSegments ?? 20;

  const radiusAt = (t: number): number => {
    // t: 0 (hem) -> 1 (top/shoulders). Wide at both ends, narrow at waist.
    const waistPinch = 1 - 0.35 * Math.sin(Math.PI * t);
    const shoulderFlare = t > 0.85 ? 1 + (t - 0.85) * 2 : 1;
    return height * 0.35 * waistPinch * shoulderFlare;
  };

  const positions: number[] = [];
  for (let h = 0; h <= heightSegments; h++) {
    const t = h / heightSegments;
    const y = t * height;
    const r = radiusAt(t);
    for (let s = 0; s < radialSegments; s++) {
      const theta = (s / radialSegments) * Math.PI * 2;
      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
    }
  }

  const indices: number[] = [];
  for (let h = 0; h < heightSegments; h++) {
    for (let s = 0; s < radialSegments; s++) {
      const a = h * radialSegments + s;
      const b = h * radialSegments + ((s + 1) % radialSegments);
      const c = (h + 1) * radialSegments + s;
      const d = (h + 1) * radialSegments + ((s + 1) % radialSegments);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

// Builds an already-rigged version: a synthetic garment mesh bound to a
// 9-bone canonical skeleton, with caller-supplied shoulder/arm bone
// positions -- used to test the width-measurement fallback chain
// (Bug 3) without needing a real asset with a particular rig topology.
export function buildAlreadyRiggedGarment(bonePositions: {
  spine?: THREE.Vector3;
  spine1?: THREE.Vector3;
  spine2?: THREE.Vector3;
  leftShoulder?: THREE.Vector3;
  rightShoulder?: THREE.Vector3;
  leftArm?: THREE.Vector3;
  rightArm?: THREE.Vector3;
  leftForeArm?: THREE.Vector3;
  rightForeArm?: THREE.Vector3;
}): THREE.Group {
  const makeBone = (name: string, pos?: THREE.Vector3) => {
    const b = new THREE.Bone();
    b.name = name;
    if (pos) b.position.copy(pos);
    return b;
  };

  const spine = makeBone('Spine', bonePositions.spine ?? new THREE.Vector3(0, 0, 0));
  const spine1 = makeBone('Spine1', bonePositions.spine1 ?? new THREE.Vector3(0, 0.2, 0));
  const spine2 = makeBone('Spine2', bonePositions.spine2 ?? new THREE.Vector3(0, 0.2, 0));
  const lShoulder = makeBone('LeftShoulder', bonePositions.leftShoulder ?? new THREE.Vector3(0, 0.1, 0));
  const rShoulder = makeBone('RightShoulder', bonePositions.rightShoulder ?? new THREE.Vector3(0, 0.1, 0));
  const lArm = makeBone('LeftArm', bonePositions.leftArm ?? new THREE.Vector3(0.13, 0, 0));
  const rArm = makeBone('RightArm', bonePositions.rightArm ?? new THREE.Vector3(-0.13, 0, 0));
  const lForeArm = makeBone('LeftForeArm', bonePositions.leftForeArm ?? new THREE.Vector3(0.15, 0, 0));
  const rForeArm = makeBone('RightForeArm', bonePositions.rightForeArm ?? new THREE.Vector3(-0.15, 0, 0));

  spine.add(spine1);
  spine1.add(spine2);
  spine2.add(lShoulder);
  spine2.add(rShoulder);
  lShoulder.add(lArm);
  lArm.add(lForeArm);
  rShoulder.add(rArm);
  rArm.add(rForeArm);

  const bones = [spine, spine1, spine2, lShoulder, lArm, lForeArm, rShoulder, rArm, rForeArm];
  const skeleton = new THREE.Skeleton(bones);

  const base = buildSyntheticGarmentMesh();
  const plainMesh = base.children[0] as THREE.Mesh;
  const skinned = new THREE.SkinnedMesh(plainMesh.geometry, plainMesh.material);

  const vertexCount = plainMesh.geometry.attributes.position.count;
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    skinIndices[i * 4] = 0;
    skinWeights[i * 4] = 1;
  }
  skinned.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  skinned.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const group = new THREE.Group();
  group.add(spine);
  group.add(skinned);
  skinned.bind(skeleton, skinned.matrixWorld);
  group.updateMatrixWorld(true);
  return group;
}
