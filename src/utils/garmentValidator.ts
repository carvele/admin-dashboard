import * as THREE from 'three';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class GarmentValidator {
  
  public static validate(scene: THREE.Object3D, skeleton: THREE.Skeleton): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check hierarchy
    const requiredBones = ['Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'RightShoulder', 'RightArm', 'RightForeArm'];
    const boneNames = skeleton.bones.map(b => b.name);
    for (const req of requiredBones) {
      if (!boneNames.includes(req)) {
        errors.push(`Missing required canonical bone: ${req}`);
      }
    }

    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    scene.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        skinnedMeshes.push(child as THREE.SkinnedMesh);
      }
    });

    if (skinnedMeshes.length === 0) {
      errors.push("No skinned meshes found in the GLB.");
      return { valid: false, errors, warnings };
    }

    for (const mesh of skinnedMeshes) {
      this.validateMeshAttributes(mesh, errors, warnings);
      if (errors.length === 0) {
        this.runDeformationStressTest(mesh, skeleton, errors, warnings);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private static validateMeshAttributes(mesh: THREE.SkinnedMesh, errors: string[], warnings: string[]) {
    const weights = mesh.geometry.attributes.skinWeight;
    const indices = mesh.geometry.attributes.skinIndex;

    if (!weights || !indices) {
      errors.push("Mesh is missing skin weights or indices.");
      return;
    }

    let unweightedCount = 0;
    let nanCount = 0;
    let overInfluencedCount = 0;

    for (let i = 0; i < weights.count; i++) {
      let sum = 0;
      let nonZeroCount = 0;
      for (let j = 0; j < 4; j++) {
        const w = weights.getComponent(i, j);
        if (Number.isNaN(w)) {
          nanCount++;
        }
        sum += w;
        if (w > 0) nonZeroCount++;
      }

      if (sum < 0.001) {
        unweightedCount++;
      } else if (Math.abs(sum - 1.0) > 0.01) {
        // Normalization error
        nanCount++; // Treating un-normalized as invalid
      }

      if (nonZeroCount > 4) {
        // Buffer technically restricts to 4, but let's be strict
        overInfluencedCount++;
      }
    }

    if (unweightedCount > 0) {
      errors.push(`${unweightedCount} unweighted vertices found.`);
    }
    if (nanCount > 0) {
      errors.push(`${nanCount} vertices have invalid or un-normalized weights.`);
    }

    // Check Weight Continuity
    const index = mesh.geometry.getIndex();
    if (index) {
      let discontinuityCount = 0;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        const b = index.getX(i + 1);
        const c = index.getX(i + 2);
        
        if (this.isDiscontinuous(weights, indices, a, b) ||
            this.isDiscontinuous(weights, indices, b, c) ||
            this.isDiscontinuous(weights, indices, c, a)) {
          discontinuityCount++;
        }
      }
      if (discontinuityCount > index.count * 0.05) { // If > 5% of triangles have sharp seams
        warnings.push(`High weight discontinuity detected (${discontinuityCount} edges). This may cause mesh tearing.`);
      }
    }
  }

  private static isDiscontinuous(weights: THREE.BufferAttribute, indices: THREE.BufferAttribute, v1: number, v2: number): boolean {
    // Collect effective weights mapped by bone index
    const w1 = new Map<number, number>();
    const w2 = new Map<number, number>();
    for (let j = 0; j < 4; j++) {
      w1.set(indices.getComponent(v1, j), weights.getComponent(v1, j));
      w2.set(indices.getComponent(v2, j), weights.getComponent(v2, j));
    }
    
    // Compare primary bone influence
    let primary1 = -1, maxW1 = 0;
    for (const [bone, w] of w1.entries()) {
      if (w > maxW1) { maxW1 = w; primary1 = bone; }
    }
    
    let primary2 = -1, maxW2 = 0;
    for (const [bone, w] of w2.entries()) {
      if (w > maxW2) { maxW2 = w; primary2 = bone; }
    }

    // Extreme discontinuity: primary bones are different AND neither vertex shares the other's primary bone with at least 0.2 weight
    if (primary1 !== primary2) {
      const w2_has_p1 = w2.get(primary1) || 0;
      const w1_has_p2 = w1.get(primary2) || 0;
      if (w2_has_p1 < 0.2 && w1_has_p2 < 0.2) {
        return true;
      }
    }
    return false;
  }

  private static runDeformationStressTest(mesh: THREE.SkinnedMesh, skeleton: THREE.Skeleton, errors: string[], warnings: string[]) {
    const bindMatrix = mesh.bindMatrix;
    const bindMatrixInverse = mesh.bindMatrixInverse;
    const geometry = mesh.geometry;
    const pos = geometry.attributes.position;
    
    // We will test the bounds under extreme poses
    // 1. T-Pose -> Arms Up
    
    const leftArm = skeleton.getBoneByName('LeftArm');
    const rightArm = skeleton.getBoneByName('RightArm');
    const leftElbow = skeleton.getBoneByName('LeftForeArm');
    
    if (!leftArm || !rightArm || !leftElbow) return;

    // Backup original rotations
    const origLA = leftArm.rotation.clone();
    const origRA = rightArm.rotation.clone();
    const origLE = leftElbow.rotation.clone();

    // Calculate dynamic threshold based on garment size
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxGarmentDimension = Math.max(size.x, size.y, size.z);
    
    // A vertex displacing more than 1.5x the maximum dimension of the garment is a guaranteed explosion.
    // We add a fallback of 0.5m just in case the bounding box is improperly scaled.
    const dynamicThreshold = Math.max(maxGarmentDimension * 1.5, 0.5);

    // Box size check helper
    const checkExplosion = (poseName: string) => {
      skeleton.update();
      const maxDisp = this.getMaxDisplacement(mesh, pos, skeleton, bindMatrix, bindMatrixInverse);
      if (maxDisp > dynamicThreshold) { 
        errors.push(`Deformation stress test failed: ${poseName} caused vertices to explode (> ${dynamicThreshold.toFixed(2)}m displacement relative to garment size).`);
      }
    };

    // Test: Arms Up (+90 Z)
    leftArm.rotation.z += Math.PI / 2;
    rightArm.rotation.z -= Math.PI / 2;
    checkExplosion("Arms Up");

    // Restore
    leftArm.rotation.copy(origLA);
    rightArm.rotation.copy(origRA);

    // Test: Elbow Bend (+90 Z)
    leftElbow.rotation.z += Math.PI / 2;
    checkExplosion("Elbow Bend");

    // Restore
    leftElbow.rotation.copy(origLE);

    // Test: Crossed Arms
    leftArm.rotation.z -= Math.PI / 4;
    leftArm.rotation.y += Math.PI / 2;
    leftElbow.rotation.y -= Math.PI / 2;
    rightArm.rotation.z += Math.PI / 4;
    rightArm.rotation.y -= Math.PI / 2;
    checkExplosion("Crossed Arms");

    // Restore
    leftArm.rotation.copy(origLA);
    rightArm.rotation.copy(origRA);
    leftElbow.rotation.copy(origLE);
  }

  private static getMaxDisplacement(
    mesh: THREE.SkinnedMesh,
    pos: THREE.BufferAttribute,
    skeleton: THREE.Skeleton,
    bindMatrix: THREE.Matrix4,
    bindMatrixInverse: THREE.Matrix4
  ): number {
    let maxDist = 0;
    const weights = mesh.geometry.attributes.skinWeight;
    const indices = mesh.geometry.attributes.skinIndex;

    const v = new THREE.Vector3();
    const vDeformed = new THREE.Vector3();
    const temp = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      vDeformed.set(0, 0, 0);

      for (let j = 0; j < 4; j++) {
        const weight = weights.getComponent(i, j);
        if (weight === 0) continue;

        const boneIndex = indices.getComponent(i, j);
        const bone = skeleton.bones[boneIndex];
        if (!bone) continue;

        temp.copy(v);
        temp.applyMatrix4(bindMatrix);
        temp.applyMatrix4(skeleton.boneInverses[boneIndex]);
        temp.applyMatrix4(bone.matrixWorld);
        temp.multiplyScalar(weight);
        vDeformed.add(temp);
      }
      
      vDeformed.applyMatrix4(bindMatrixInverse);
      const d = v.distanceTo(vDeformed);
      if (d > maxDist) maxDist = d;
    }
    return maxDist;
  }
}
