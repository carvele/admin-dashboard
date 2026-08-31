import * as THREE from 'three';
import { GarmentIngestor } from './garmentIngestor';
import { buildSyntheticGarmentMesh, buildAlreadyRiggedGarment } from './__testUtils__/syntheticGarment';

// Independent re-measurement of world-space vertical vertex extent, deliberately
// not sharing implementation with GarmentIngestor.normalizeSceneScale() -- this
// is the check, not a mirror of the code under test.
function measureWorldHeight(scene: THREE.Object3D): number {
  scene.updateMatrixWorld(true);
  let minY = Infinity, maxY = -Infinity;
  const v = new THREE.Vector3();
  scene.traverse((child) => {
    const position = (child as THREE.Mesh).geometry?.attributes?.position;
    if (!(child as THREE.Mesh).isMesh || !position) return;
    (child as THREE.Mesh).updateMatrixWorld();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position as THREE.BufferAttribute, i);
      v.applyMatrix4((child as THREE.Mesh).matrixWorld);
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  });
  return maxY - minY;
}

describe('GarmentIngestor.analyzeGLB -- scale normalization (Bug 2)', () => {
  test('rescales a ~700x oversized scene down to plausible garment height', () => {
    const scene = buildSyntheticGarmentMesh({ heightUnits: 0.6 });
    scene.scale.setScalar(700);
    scene.updateMatrixWorld(true);
    expect(measureWorldHeight(scene)).toBeGreaterThan(2.2); // sanity: genuinely oversized first

    GarmentIngestor.analyzeGLB('scale-test-oversized', 'shirt', scene);

    const finalHeight = measureWorldHeight(scene);
    expect(finalHeight).toBeGreaterThan(0.15);
    expect(finalHeight).toBeLessThan(2.2);
    expect(finalHeight).toBeCloseTo(0.65, 1);
  });

  test('leaves an already-plausible ~0.6m garment untouched', () => {
    const scene = buildSyntheticGarmentMesh({ heightUnits: 0.6 });
    scene.updateMatrixWorld(true);
    const before = measureWorldHeight(scene);

    GarmentIngestor.analyzeGLB('scale-test-normal', 'shirt', scene);

    const after = measureWorldHeight(scene);
    expect(after).toBeCloseTo(before, 5);
  });

  test('rescales an implausibly tiny (~0.001x) scene upward', () => {
    const scene = buildSyntheticGarmentMesh({ heightUnits: 0.6 });
    scene.scale.setScalar(0.001);
    scene.updateMatrixWorld(true);
    expect(measureWorldHeight(scene)).toBeLessThan(0.15); // sanity: genuinely tiny first

    GarmentIngestor.analyzeGLB('scale-test-tiny', 'shirt', scene);

    const finalHeight = measureWorldHeight(scene);
    expect(finalHeight).toBeGreaterThan(0.15);
    expect(finalHeight).toBeCloseTo(0.65, 1);
  });
});

describe('GarmentIngestor.analyzeGLB -- ALREADY_RIGGED width measurement fallback (Bug 3)', () => {
  test('measures width from Arm bones when Shoulder bones are coincident (the Black tee regression)', () => {
    const scene = buildAlreadyRiggedGarment({
      leftShoulder: new THREE.Vector3(0, 0.12, 0),
      rightShoulder: new THREE.Vector3(0, 0.12, 0), // coincident with left -- the actual bug shape
      leftArm: new THREE.Vector3(0.13, 0, 0),
      rightArm: new THREE.Vector3(-0.13, 0, 0),
    });

    const metadata = GarmentIngestor.analyzeGLB('bug3-coincident-shoulders', 'shirt', scene);

    expect(metadata.autoRigged).toBe(false);
    expect(metadata.restPoseMetricWidth).toBeGreaterThan(0.2);
    expect(metadata.restPoseMetricWidth).toBeLessThan(0.3);
  });

  test('falls back to Shoulder bones when Arm bones are coincident', () => {
    const scene = buildAlreadyRiggedGarment({
      leftShoulder: new THREE.Vector3(0.1, 0.12, 0),
      rightShoulder: new THREE.Vector3(-0.1, 0.12, 0),
      leftArm: new THREE.Vector3(0, 0, 0),
      rightArm: new THREE.Vector3(0, 0, 0), // coincident with left
    });

    const metadata = GarmentIngestor.analyzeGLB('bug3-coincident-arms', 'shirt', scene);

    expect(metadata.autoRigged).toBe(false);
    // Should use the Shoulder pair (~0.2 apart), not the coincident Arm pair (0).
    expect(metadata.restPoseMetricWidth).toBeGreaterThan(0.15);
    expect(metadata.restPoseMetricWidth).toBeLessThan(0.25);
  });

  test('does not silently return zero width when both bone pairs are coincident', () => {
    const scene = buildAlreadyRiggedGarment({
      leftShoulder: new THREE.Vector3(0, 0.12, 0),
      rightShoulder: new THREE.Vector3(0, 0.12, 0),
      leftArm: new THREE.Vector3(0, 0, 0),
      rightArm: new THREE.Vector3(0, 0, 0),
    });

    const metadata = GarmentIngestor.analyzeGLB('bug3-both-coincident', 'shirt', scene);

    // Falls through to the bounding-size fallback rather than reporting 0.
    expect(metadata.restPoseMetricWidth).toBeGreaterThan(0);
  });
});

describe('GarmentIngestor.analyzeGLB -- full NEEDS_AUTO_RIG pipeline, structural invariants', () => {
  test('produces a valid rig with zero validation errors and finite measurements', () => {
    const scene = buildSyntheticGarmentMesh({ heightUnits: 0.6 });
    const metadata = GarmentIngestor.analyzeGLB('full-pipeline-test', 'shirt', scene);

    expect(metadata.autoRigged).toBe(true);
    expect(metadata.ingestionStatus).toBe('NEEDS_CALIBRATION');
    expect(metadata.validationErrors).toEqual([]);
    expect(Object.keys(metadata.boneMap)).toHaveLength(9);

    expect(Number.isFinite(metadata.restPoseMetricWidth)).toBe(true);
    expect(metadata.restPoseMetricWidth).toBeGreaterThan(0);
    expect(Number.isFinite(metadata.anatomicalAnchorOffset.x)).toBe(true);
    expect(Number.isFinite(metadata.anatomicalAnchorOffset.y)).toBe(true);
    expect(Number.isFinite(metadata.anatomicalAnchorOffset.z)).toBe(true);
  });
});
