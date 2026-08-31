import * as THREE from 'three';
import { GarmentAutoRigger } from './garmentAutoRigger';
import { GarmentAnatomyDetector } from './garmentAnatomyDetector';
import { GarmentValidator } from './garmentValidator';
import { buildSyntheticGarmentMesh } from './__testUtils__/syntheticGarment';

// Layer 2 (component integration): AutoRigger -> Skinner -> SkinnedMesh -> Validator.
// Regression test for Bug 1 (source audit rev.3, section 3B): a mesh that is
// ALREADY a THREE.SkinnedMesh (bound to some unrelated, unrecognized rig) but
// was routed to NEEDS_AUTO_RIG must still be converted and rebound -- the old
// `!isSkinnedMesh` guard silently skipped it, leaving stale out-of-range
// skinIndex values that crashed GarmentValidator with a raw TypeError.
describe('GarmentAutoRigger', () => {
  function buildAlreadySkinnedButUnrecognized(): THREE.Group {
    const group = buildSyntheticGarmentMesh();
    const plainMesh = group.children[0] as THREE.Mesh;

    // A foreign, unrelated skeleton with a bone count far larger than the
    // canonical 9-bone rig -- mirrors the real Testing1.glb crash, which
    // read skinIndex value 154 against a 9-bone array.
    const foreignBones: THREE.Bone[] = [];
    for (let i = 0; i < 160; i++) {
      const b = new THREE.Bone();
      b.name = `foreign_joint_${i}`;
      foreignBones.push(b);
    }
    for (let i = 1; i < foreignBones.length; i++) foreignBones[0].add(foreignBones[i]);
    const foreignSkeleton = new THREE.Skeleton(foreignBones);

    const skinned = new THREE.SkinnedMesh(plainMesh.geometry, plainMesh.material);
    const vertexCount = plainMesh.geometry.attributes.position.count;
    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);
    for (let i = 0; i < vertexCount; i++) {
      // Deliberately reference a high, foreign-skeleton-only bone index --
      // exactly the shape of data that crashed the validator before the fix.
      skinIndices[i * 4] = 154;
      skinWeights[i * 4] = 1;
    }
    skinned.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    skinned.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const newGroup = new THREE.Group();
    newGroup.add(foreignBones[0]);
    newGroup.add(skinned);
    skinned.bind(foreignSkeleton, skinned.matrixWorld);
    newGroup.updateMatrixWorld(true);
    return newGroup;
  }

  test('converts a mesh that is already a SkinnedMesh with an unrecognized rig', () => {
    const scene = buildAlreadySkinnedButUnrecognized();
    const anatomy = GarmentAnatomyDetector.detect(scene);
    const rig = GarmentAutoRigger.rig(scene, anatomy);

    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    scene.traverse((c) => {
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes.push(c as THREE.SkinnedMesh);
    });

    expect(skinnedMeshes).toHaveLength(1);
    // The mesh must now be bound to the NEW 9-bone canonical skeleton, not
    // left on its old 160-bone foreign one.
    expect(skinnedMeshes[0].skeleton).toBe(rig.skeleton);
    expect(skinnedMeshes[0].skeleton.bones).toHaveLength(9);
  });

  test('does not crash GarmentValidator and produces zero errors after conversion', () => {
    const scene = buildAlreadySkinnedButUnrecognized();
    const anatomy = GarmentAnatomyDetector.detect(scene);
    const rig = GarmentAutoRigger.rig(scene, anatomy);

    expect(() => GarmentValidator.validate(scene, rig.skeleton)).not.toThrow();
    const result = GarmentValidator.validate(scene, rig.skeleton);
    expect(result.errors).toEqual([]);
  });
});
