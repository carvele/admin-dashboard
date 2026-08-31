import * as THREE from 'three';
import { GarmentSkinner } from './garmentSkinner';
import { GarmentAutoRigger } from './garmentAutoRigger';
import { GarmentAnatomyDetector } from './garmentAnatomyDetector';
import { buildSyntheticGarmentMesh } from './__testUtils__/syntheticGarment';

// Layer 1 (unit): structural invariants of the weights GarmentSkinner
// produces, independent of any real GLB. Regression coverage for the
// zero-influence / over-influence / weight-sum guarantees the pipeline
// relies on elsewhere (GarmentValidator's own checks assume these hold).
describe('GarmentSkinner', () => {
  function riggedGarment() {
    const scene = buildSyntheticGarmentMesh();
    const anatomy = GarmentAnatomyDetector.detect(scene);
    const rig = GarmentAutoRigger.rig(scene, anatomy);
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    scene.traverse((c) => {
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes.push(c as THREE.SkinnedMesh);
    });
    return { scene, rig, mesh: skinnedMeshes[0] };
  }

  test('every vertex has skin weights summing to ~1 or is explicitly unweighted at 0', () => {
    const { mesh } = riggedGarment();
    const weights = mesh.geometry.attributes.skinWeight as THREE.BufferAttribute;
    for (let i = 0; i < weights.count; i++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) sum += weights.getComponent(i, j);
      expect(sum === 0 || Math.abs(sum - 1) < 0.01).toBe(true);
    }
  });

  test('never assigns more than 4 influences per vertex (buffer-enforced, but assert no NaN/garbage beyond slot 4)', () => {
    const { mesh } = riggedGarment();
    const weights = mesh.geometry.attributes.skinWeight as THREE.BufferAttribute;
    expect(weights.itemSize).toBe(4);
    for (let i = 0; i < weights.count; i++) {
      for (let j = 0; j < 4; j++) {
        expect(Number.isFinite(weights.getComponent(i, j))).toBe(true);
      }
    }
  });

  test('produces no NaN weights under normal geometry', () => {
    const { mesh } = riggedGarment();
    const weights = mesh.geometry.attributes.skinWeight as THREE.BufferAttribute;
    for (let i = 0; i < weights.count; i++) {
      for (let j = 0; j < 4; j++) {
        expect(Number.isNaN(weights.getComponent(i, j))).toBe(false);
      }
    }
  });

  test('skin indices are always within the skeleton bone-array range', () => {
    const { mesh, rig } = riggedGarment();
    const indices = mesh.geometry.attributes.skinIndex as THREE.BufferAttribute;
    for (let i = 0; i < indices.count; i++) {
      for (let j = 0; j < 4; j++) {
        const idx = indices.getComponent(i, j);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(rig.skeleton.bones.length);
      }
    }
  });

  test('a vertex with zero total influence is recorded as explicitly zero, not left undefined', () => {
    // Directly exercises GarmentSkinner.skin() against a degenerate single-vertex
    // mesh with no bone segments nearby, mirroring the "sum > 0 else zero" branch.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    const skeleton = new THREE.Skeleton([]); // no bones at all -> every vertex unweighted
    GarmentSkinner.skin(mesh, skeleton, { sleeveType: 'UNKNOWN', warnings: [] });
    const weights = mesh.geometry.attributes.skinWeight as THREE.BufferAttribute;
    const indices = mesh.geometry.attributes.skinIndex as THREE.BufferAttribute;
    expect(weights).toBeDefined();
    expect(indices).toBeDefined();
    for (let j = 0; j < 4; j++) {
      expect(weights.getComponent(0, j)).toBe(0);
      expect(indices.getComponent(0, j)).toBe(0);
    }
  });
});
