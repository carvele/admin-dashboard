import * as THREE from 'three';
import type { AnatomyLandmarks } from './garmentAnatomyDetector';
import { GarmentSkinner } from './garmentSkinner';

export interface AutoRigResult {
  success: boolean;
  skeleton: THREE.Skeleton;
  rootBone: THREE.Bone;
  boneMap: Record<string, string>;
  restPose: 'T_POSE' | 'A_POSE';
  warnings: string[];
}

export class GarmentAutoRigger {
  public static rig(scene: THREE.Object3D, anatomy: AnatomyLandmarks): AutoRigResult {
    const warnings: string[] = [];
    
    // 1. Create Bones
    const spine = new THREE.Bone();
    spine.name = 'Spine';
    
    const spine1 = new THREE.Bone();
    spine1.name = 'Spine1';
    
    const spine2 = new THREE.Bone();
    spine2.name = 'Spine2';
    
    const lShoulder = new THREE.Bone();
    lShoulder.name = 'LeftShoulder';
    
    const lArm = new THREE.Bone();
    lArm.name = 'LeftArm';
    
    const lForeArm = new THREE.Bone();
    lForeArm.name = 'LeftForeArm';
    
    const rShoulder = new THREE.Bone();
    rShoulder.name = 'RightShoulder';
    
    const rArm = new THREE.Bone();
    rArm.name = 'RightArm';
    
    const rForeArm = new THREE.Bone();
    rForeArm.name = 'RightForeArm';

    // 2. Build Hierarchy
    spine.add(spine1);
    spine1.add(spine2);
    spine2.add(lShoulder);
    spine2.add(rShoulder);
    lShoulder.add(lArm);
    lArm.add(lForeArm);
    rShoulder.add(rArm);
    rArm.add(rForeArm);


    // 3. Position Bones from Anatomy using True Coordinate Spaces (P0 Fix)
    // We construct world positions first, then convert to local space.
    
    // Add to scene early so matrix updates work correctly
    scene.add(spine);

    // Spine (Waist)
    if (anatomy.waist) {
      spine.position.set(anatomy.waist.position.x, anatomy.waist.position.y, anatomy.waist.position.z);
    } else {
      spine.position.set(0, 0, 0);
      warnings.push("Missing waist landmark, placing Spine at origin.");
    }
    spine.updateMatrixWorld(true);

    const neckWorld = anatomy.neck ? new THREE.Vector3(anatomy.neck.position.x, anatomy.neck.position.y - 0.1, anatomy.neck.position.z) : new THREE.Vector3(0, spine.position.y + 0.5, 0);
    const spineWorld = new THREE.Vector3().copy(spine.position);
    
    // Spine2 (Neck)
    const spine2World = neckWorld.clone();
    
    // Spine1 (Midpoint)
    const spine1World = new THREE.Vector3().lerpVectors(spineWorld, spine2World, 0.5);
    
    // Set Spine1 local
    spine1.position.copy(spine.worldToLocal(spine1World.clone()));
    spine.updateMatrixWorld(true);
    
    // Set Spine2 local
    spine2.position.copy(spine1.worldToLocal(spine2World.clone()));
    spine.updateMatrixWorld(true);

    // Shoulders
    if (anatomy.leftShoulder) {
      const lShoulderWorld = new THREE.Vector3(anatomy.leftShoulder.position.x, anatomy.leftShoulder.position.y, anatomy.leftShoulder.position.z);
      lShoulder.position.copy(spine2.worldToLocal(lShoulderWorld.clone()));
    }
    if (anatomy.rightShoulder) {
      const rShoulderWorld = new THREE.Vector3(anatomy.rightShoulder.position.x, anatomy.rightShoulder.position.y, anatomy.rightShoulder.position.z);
      rShoulder.position.copy(spine2.worldToLocal(rShoulderWorld.clone()));
    }
    spine.updateMatrixWorld(true);

    // Arms
    let restPose: 'T_POSE' | 'A_POSE' = 'A_POSE'; // default to A_POSE for unrigged
    
    // Left Arm (Start of arm)
    // We assume the arm bone starts slightly outward from the shoulder joint
    const lArmWorld = lShoulder.getWorldPosition(new THREE.Vector3());
    lArmWorld.x += 0.05; // slightly outward
    lArm.position.copy(lShoulder.worldToLocal(lArmWorld.clone()));
    spine.updateMatrixWorld(true);
    
    if (anatomy.sleeveType === 'SLEEVELESS') {
      const lForeArmWorld = lArm.getWorldPosition(new THREE.Vector3());
      lForeArmWorld.x += 0.05;
      lForeArm.position.copy(lArm.worldToLocal(lForeArmWorld.clone()));
    } else if (anatomy.leftSleeveEnd && anatomy.leftShoulder) {
      const lSleeveEndWorld = new THREE.Vector3(anatomy.leftSleeveEnd.position.x, anatomy.leftSleeveEnd.position.y, anatomy.leftSleeveEnd.position.z);
      const lShoulderWorld = new THREE.Vector3(anatomy.leftShoulder.position.x, anatomy.leftShoulder.position.y, anatomy.leftShoulder.position.z);
      
      const dx = lSleeveEndWorld.x - lShoulderWorld.x;
      const dy = lSleeveEndWorld.y - lShoulderWorld.y;
      if (Math.abs(dy) < Math.abs(dx) * 0.3) {
        restPose = 'T_POSE';
      }
      
      // Forearm is midpoint of sleeve
      const lForeArmWorld = new THREE.Vector3().lerpVectors(lShoulderWorld, lSleeveEndWorld, 0.5);
      lForeArm.position.copy(lArm.worldToLocal(lForeArmWorld.clone()));
    }
    spine.updateMatrixWorld(true);

    // Right Arm
    const rArmWorld = rShoulder.getWorldPosition(new THREE.Vector3());
    rArmWorld.x -= 0.05;
    rArm.position.copy(rShoulder.worldToLocal(rArmWorld.clone()));
    spine.updateMatrixWorld(true);
    
    if (anatomy.sleeveType === 'SLEEVELESS') {
      const rForeArmWorld = rArm.getWorldPosition(new THREE.Vector3());
      rForeArmWorld.x -= 0.05;
      rForeArm.position.copy(rArm.worldToLocal(rForeArmWorld.clone()));
    } else if (anatomy.rightSleeveEnd && anatomy.rightShoulder) {
      const rSleeveEndWorld = new THREE.Vector3(anatomy.rightSleeveEnd.position.x, anatomy.rightSleeveEnd.position.y, anatomy.rightSleeveEnd.position.z);
      const rShoulderWorld = new THREE.Vector3(anatomy.rightShoulder.position.x, anatomy.rightShoulder.position.y, anatomy.rightShoulder.position.z);
      const rForeArmWorld = new THREE.Vector3().lerpVectors(rShoulderWorld, rSleeveEndWorld, 0.5);
      rForeArm.position.copy(rArm.worldToLocal(rForeArmWorld.clone()));
    }
    spine.updateMatrixWorld(true);

    const bones = [spine, spine1, spine2, lShoulder, lArm, lForeArm, rShoulder, rArm, rForeArm];
    const skeleton = new THREE.Skeleton(bones);

    // 4. Attach to scene and convert Meshes to SkinnedMeshes
    
    const meshesToReplace: { old: THREE.Mesh, new: THREE.SkinnedMesh }[] = [];
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    
    scene.traverse((child) => {
      // Convert every mesh reaching this point, including ones that are already
      // a SkinnedMesh -- GarmentAnalyzer already decided the scene needs auto-rigging,
      // so a pre-existing but unrecognized rig must be replaced, not left bound to a
      // skeleton the validator (and mobile renderer) know nothing about.
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const skinned = new THREE.SkinnedMesh(mesh.geometry.clone(), mesh.material); // Clone geometry so we can add attributes safely
        skinned.position.copy(mesh.position);
        skinned.rotation.copy(mesh.rotation);
        skinned.scale.copy(mesh.scale);
        skinned.bind(skeleton, skinned.matrixWorld);
        meshesToReplace.push({ old: mesh, new: skinned });
        skinnedMeshes.push(skinned);
      }
    });

    for (const pair of meshesToReplace) {
      const parent = pair.old.parent;
      if (parent) {
        parent.remove(pair.old);
        parent.add(pair.new);
      }
    }

    // 5. Apply Auto-Skinning
    for (const skinned of skinnedMeshes) {
      GarmentSkinner.skin(skinned, skeleton, anatomy);
    }

    const boneMap = {
      'Spine': 'Spine',
      'Spine1': 'Spine1',
      'Spine2': 'Spine2',
      'LeftShoulder': 'LeftShoulder',
      'LeftArm': 'LeftArm',
      'LeftForeArm': 'LeftForeArm',
      'RightShoulder': 'RightShoulder',
      'RightArm': 'RightArm',
      'RightForeArm': 'RightForeArm'
    };

    return {
      success: true,
      skeleton,
      rootBone: spine,
      boneMap,
      restPose,
      warnings
    };
  }
}
