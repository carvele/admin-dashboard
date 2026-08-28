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

    // 3. Position Bones from Anatomy
    if (anatomy.waist) {
      spine.position.set(anatomy.waist.position.x, anatomy.waist.position.y, anatomy.waist.position.z);
    } else {
      spine.position.set(0, 0, 0);
      warnings.push("Missing waist landmark, placing Spine at origin.");
    }

    if (anatomy.neck) {
      // Local position relative to spine
      spine2.position.set(
        anatomy.neck.position.x - spine.position.x,
        anatomy.neck.position.y - spine.position.y - 0.1, // slightly below neck
        anatomy.neck.position.z - spine.position.z
      );
    }

    // Spine1 is midpoint between Spine and Spine2
    spine1.position.set(
      spine2.position.x * 0.5,
      spine2.position.y * 0.5,
      spine2.position.z * 0.5
    );

    // Shoulders
    const neckPos = anatomy.neck ? anatomy.neck.position : { x: 0, y: spine.position.y + 0.5, z: 0 };
    if (anatomy.leftShoulder) {
      lShoulder.position.set(
        anatomy.leftShoulder.position.x - neckPos.x,
        anatomy.leftShoulder.position.y - neckPos.y,
        anatomy.leftShoulder.position.z - neckPos.z
      );
    }
    if (anatomy.rightShoulder) {
      rShoulder.position.set(
        anatomy.rightShoulder.position.x - neckPos.x,
        anatomy.rightShoulder.position.y - neckPos.y,
        anatomy.rightShoulder.position.z - neckPos.z
      );
    }

    // Arms
    let restPose: 'T_POSE' | 'A_POSE' = 'A_POSE'; // default to A_POSE for unrigged
    
    // Left Arm setup
    lArm.position.set(0.05, 0, 0); // slightly outward from shoulder
    if (anatomy.sleeveType === 'SLEEVELESS') {
      // Stubs
      lForeArm.position.set(0.05, 0, 0);
    } else if (anatomy.leftSleeveEnd) {
      const dx = anatomy.leftSleeveEnd.position.x - anatomy.leftShoulder!.position.x;
      const dy = anatomy.leftSleeveEnd.position.y - anatomy.leftShoulder!.position.y;
      
      if (Math.abs(dy) < Math.abs(dx) * 0.3) {
        restPose = 'T_POSE';
      }
      
      // Forearm is midpoint of sleeve
      lForeArm.position.set(dx * 0.5, dy * 0.5, 0);
    }

    // Right Arm setup
    rArm.position.set(-0.05, 0, 0);
    if (anatomy.sleeveType === 'SLEEVELESS') {
      rForeArm.position.set(-0.05, 0, 0);
    } else if (anatomy.rightSleeveEnd) {
      const dx = anatomy.rightSleeveEnd.position.x - anatomy.rightShoulder!.position.x;
      const dy = anatomy.rightSleeveEnd.position.y - anatomy.rightShoulder!.position.y;
      rForeArm.position.set(dx * 0.5, dy * 0.5, 0);
    }

    // Update global matrices
    spine.updateMatrixWorld(true);

    const bones = [spine, spine1, spine2, lShoulder, lArm, lForeArm, rShoulder, rArm, rForeArm];
    const skeleton = new THREE.Skeleton(bones);

    // 4. Attach to scene and convert Meshes to SkinnedMeshes
    scene.add(spine);
    
    const meshesToReplace: { old: THREE.Mesh, new: THREE.SkinnedMesh }[] = [];
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !(child as THREE.SkinnedMesh).isSkinnedMesh) {
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
