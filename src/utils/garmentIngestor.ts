import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type { GarmentMetadata, IngestionStatus, GarmentCategory } from '../types/garment';

const STANDARD_BONES = [
  'Spine',
  'Spine1',
  'Spine2',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
];

export class GarmentIngestor {
  /**
   * Analyzes an uploaded GLTF scene and generates a canonical GarmentMetadata contract.
   */
  /**
   * Fetches and parses a GLB from a URL into a Three.js scene, then analyzes it.
   */
  public static async analyzeGLBFromUrl(
    id: string,
    category: GarmentCategory,
    glbUrl: string
  ): Promise<GarmentMetadata> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        glbUrl,
        (gltf) => {
          try {
            const metadata = this.analyzeGLB(id, category, gltf.scene);
            resolve(metadata);
          } catch (e) {
            reject(e);
          }
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    });
  }

  public static analyzeGLB(
    id: string,
    category: GarmentCategory,
    scene: any // THREE.Object3D
  ): GarmentMetadata {
    let hasSkinnedMesh = false;
    const bones: Record<string, any> = {};
    const boneMap: Record<string, string> = {};

    // 1. Traverse and Validate Skeleton
    scene.traverse((child: any) => {
      if (child.isSkinnedMesh) {
        hasSkinnedMesh = true;
      }
      if (child.isBone) {
        bones[child.name] = child;
      }
    });

    if (!hasSkinnedMesh || Object.keys(bones).length === 0) {
      return this.createFailureResult(id, category, 'NOT_AR_COMPATIBLE');
    }

    // 2. Auto-map bones (heuristic matching)
    for (const stdBone of STANDARD_BONES) {
      if (bones[stdBone]) {
        boneMap[stdBone] = stdBone;
      } else if (bones['mixamorig' + stdBone]) {
        boneMap[stdBone] = 'mixamorig' + stdBone;
      }
    }

    // 3. Metric Scale Calibration
    let restPoseMetricWidth = 0.5;
    
    if (THREE) {
      const leftShoulder = bones[boneMap['LeftShoulder']] || bones[boneMap['LeftArm']];
      const rightShoulder = bones[boneMap['RightShoulder']] || bones[boneMap['RightArm']];
      if (leftShoulder && rightShoulder) {
        const lPos = new THREE.Vector3();
        const rPos = new THREE.Vector3();
        leftShoulder.getWorldPosition(lPos);
        rightShoulder.getWorldPosition(rPos);
        restPoseMetricWidth = lPos.distanceTo(rPos);
      } else {
        // Fallback to bounding box width if shoulders missing
        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        restPoseMetricWidth = size.x;
      }
    }

    // 4. Anatomical Anchoring
    const anchorOffset = { x: 0, y: 0.5, z: 0 };
    let anchorConfidence: 'detected' | 'inferred' | 'merchant_confirmed' = 'inferred';
    
    if (THREE && boneMap['Spine2'] && bones[boneMap['Spine2']]) {
      const spine2 = bones[boneMap['Spine2']];
      const pos = new THREE.Vector3();
      spine2.getWorldPosition(pos);
      anchorOffset.x = pos.x;
      anchorOffset.y = pos.y;
      anchorOffset.z = pos.z;
      anchorConfidence = 'detected';
    } else if (THREE) {
      // Inferred from bounding box top-center
      const box = new THREE.Box3().setFromObject(scene);
      const center = new THREE.Vector3();
      box.getCenter(center);
      anchorOffset.x = center.x;
      anchorOffset.y = box.max.y; // Top of the mesh
      anchorOffset.z = center.z;
    }

    // 5. Ingestion Status
    // MVP Rule: MUST have Spine + LeftArm + RightArm. MUST have 'detected' anchor.
    const hasRequiredBones = boneMap['Spine'] && boneMap['LeftArm'] && boneMap['RightArm'];
    const ingestionStatus: IngestionStatus =
      (hasRequiredBones && anchorConfidence === 'detected') ? 'AR_READY' : 'NEEDS_MERCHANT_MAPPING';

    return {
      id,
      category,
      calibrationVersion: '1.0.0',
      ingestionStatus,
      anatomicalAnchorOffset: anchorOffset,
      anchorConfidence,
      restPoseMetricWidth,
      boneMap,
      restPose: 'T_POSE' // Can be heuristically detected by arm angles
    };
  }

  private static createFailureResult(
    id: string,
    category: GarmentCategory,
    status: IngestionStatus
  ): GarmentMetadata {
    return {
      id,
      category,
      calibrationVersion: '1.0.0',
      ingestionStatus: status,
      anatomicalAnchorOffset: { x: 0, y: 0, z: 0 },
      anchorConfidence: 'inferred',
      restPoseMetricWidth: 0.5,
      boneMap: {},
      restPose: 'CUSTOM'
    };
  }
}