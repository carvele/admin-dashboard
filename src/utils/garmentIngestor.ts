import { GarmentAnalyzer } from './garmentAnalyzer';
import { GarmentAnatomyDetector } from './garmentAnatomyDetector';
import { GarmentAutoRigger } from './garmentAutoRigger';
import { GarmentValidator } from './garmentValidator';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type { GarmentMetadata, IngestionStatus, GarmentCategory } from '../types/garment';

export const STANDARD_BONES = [
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
  public static async analyzeGLBFromUrl(
    id: string,
    category: GarmentCategory,
    glbUrl: string
  ): Promise<{ metadata: GarmentMetadata, riggedGlbUrl?: string, riggedGlbBlob?: Blob }> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        glbUrl,
        async (gltf) => {
          try {
            const metadata = this.analyzeGLB(id, category, gltf.scene);
            
            if (metadata.autoRigged) {
              const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
              const exporter = new GLTFExporter();
              exporter.parse(
                gltf.scene,
                (gltfResult) => {
                  const blob = new Blob([gltfResult as ArrayBuffer], { type: 'model/gltf-binary' });
                  const riggedGlbUrl = URL.createObjectURL(blob);
                  resolve({ metadata, riggedGlbUrl, riggedGlbBlob: blob });
                },
                (err) => reject(err),
                { binary: true }
              );
            } else {
              resolve({ metadata });
            }
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

    // 0. Normalize scale. Source GLBs (esp. FBX/Mixamo exports with an
    // un-baked root scale) routinely land many multiples of real-world size --
    // THREE.Box3().setFromObject() is also unreliable for a SkinnedMesh, so we
    // measure world-space vertex extent directly rather than trust either.
    this.normalizeSceneScale(scene);

    // 1. Analyze Geometry and Skeleton
    const analysis = GarmentAnalyzer.analyze(scene);
    
    if (analysis.route === 'UNSUPPORTED') {
      return this.createFailureResult(id, category, 'NOT_AR_COMPATIBLE');
    }
    
    if (analysis.route === 'ALREADY_RIGGED') {
      return this.buildMetadataFromRigged(id, category, scene, analysis);
    }
    
    if (analysis.route === 'NEEDS_AUTO_RIG') {
      // 2. Anatomy Detection
      const anatomy = GarmentAnatomyDetector.detect(scene);
      
      // 3. Auto Rigging & Skinning
      const rigResult = GarmentAutoRigger.rig(scene, anatomy);
      
      // 4. Validate output
      const validation = GarmentValidator.validate(scene, rigResult.skeleton);
      
      return {
        id,
        category,
        calibrationVersion: '2.0.0',
        ingestionStatus: 'NEEDS_CALIBRATION',
        anatomicalAnchorOffset: anatomy.neck 
          ? { x: anatomy.neck.position.x, y: anatomy.neck.position.y, z: anatomy.neck.position.z }
          : { x: 0, y: 0.5, z: 0 },
        anchorConfidence: anatomy.neck && anatomy.neck.confidence > 0.8 ? 'HIGH' : 'MEDIUM',
        anchorType: (category === 'pants' || category === 'skirt') ? 'WAIST' : 'SHOULDER_CENTER',
        restPoseMetricWidth: (anatomy.rightShoulder && anatomy.leftShoulder) 
          ? Math.abs(anatomy.rightShoulder.position.x - anatomy.leftShoulder.position.x)
          : 0.5,
        boneMap: rigResult.boneMap,
        restPose: rigResult.restPose,
        autoRigged: true,
        sleeveType: anatomy.sleeveType,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings
      };
    }

    return this.createFailureResult(id, category, 'NOT_AR_COMPATIBLE');
  }


  private static buildMetadataFromRigged(
    id: string,
    category: GarmentCategory,
    scene: any,
    analysis: any
  ): GarmentMetadata {
    // CRITICAL FIX: Ensure matrices are updated before measuring bone world positions!
    scene.updateMatrixWorld(true);
    
    const bones: Record<string, any> = {};

    scene.traverse((child: any) => {
      if (child.isBone) bones[child.name] = child;
    });

    const boneMap = analysis.canonicalMapping;

    // Shoulder (clavicle) bones commonly sit on the spine centerline in many
    // rig conventions -- including this one, where LeftShoulder/RightShoulder
    // are both at x=0 and only LeftArm/RightArm carry the real lateral offset.
    // Try Arm bones first since they reliably carry span; fall back to
    // Shoulder bones, then the (Box3-derived, less reliable for a SkinnedMesh)
    // bounding size. A near-zero result from a bone pair is treated as
    // unusable rather than accepted at face value.
    const pairWidth = (aKey: string, bKey: string): number | null => {
      const a = bones[boneMap[aKey]];
      const b = bones[boneMap[bKey]];
      if (!a || !b) return null;
      const aPos = new THREE.Vector3();
      const bPos = new THREE.Vector3();
      a.getWorldPosition(aPos);
      b.getWorldPosition(bPos);
      const d = aPos.distanceTo(bPos);
      return d > 0.01 ? d : null;
    };

    const restPoseMetricWidth =
      pairWidth('LeftArm', 'RightArm') ??
      pairWidth('LeftShoulder', 'RightShoulder') ??
      analysis.boundingSize.x;

    const anchorOffset = { x: 0, y: 0.5, z: 0 };
    let anchorConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    
    if (boneMap['Spine2'] && bones[boneMap['Spine2']]) {
      const spine2 = bones[boneMap['Spine2']];
      const pos = new THREE.Vector3();
      spine2.getWorldPosition(pos);
      anchorOffset.x = pos.x;
      anchorOffset.y = pos.y;
      anchorOffset.z = pos.z;
      anchorConfidence = 'HIGH';
    } else {
      anchorOffset.x = analysis.center.x;
      anchorOffset.y = analysis.boundingBox.max.y;
      anchorOffset.z = analysis.center.z;
    }

    return {
      id,
      category,
      calibrationVersion: '2.0.0',
      ingestionStatus: 'AR_READY',
      anatomicalAnchorOffset: anchorOffset,
      anchorConfidence,
      anchorType: (category === 'pants' || category === 'skirt') ? 'WAIST' : 'SHOULDER_CENTER',
      restPoseMetricWidth,
      boneMap,
      restPose: 'T_POSE',
      autoRigged: false,
      sleeveType: 'UNKNOWN'
    };
  }

  // Un-baked FBX/Mixamo root scale is common in third-party GLBs and silently
  // propagates into every downstream measurement. Rescaled to a plausible
  // real-world garment height if it falls well outside human scale.
  //
  // Measurement source depends on whether the scene has a skeleton: raw mesh
  // vertex positions are unreliable for a SkinnedMesh (confirmed live -- one
  // real rigged asset read as 0.0028m from vertices while its own bones read
  // a correct, plausible 1.74m; trusting the vertex reading here previously
  // caused this function to "fix" an already-correct asset by scaling it up
  // ~232x). Box3().setFromObject() has the same unreliability, independently
  // confirmed elsewhere in this codebase and in the mobile renderer. Bone
  // world positions are reliable and used whenever any exist; mesh vertices
  // are the only signal available for a genuinely unrigged scene (nothing to
  // fall back to before auto-rigging has run) and are used only then.
  private static normalizeSceneScale(scene: any): void {
    const MIN_PLAUSIBLE_HEIGHT = 0.15;
    const MAX_PLAUSIBLE_HEIGHT = 2.2;
    const TARGET_HEIGHT = 0.65;

    scene.updateMatrixWorld(true);

    let minY = Infinity, maxY = -Infinity;
    let hasBones = false;
    const v = new THREE.Vector3();
    scene.traverse((child: any) => {
      if (child.isBone) {
        hasBones = true;
        child.getWorldPosition(v);
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    });

    if (hasBones) {
      if (!isFinite(minY) || !isFinite(maxY)) return;
      const boneHeight = maxY - minY;
      if (boneHeight <= 0) return;
      if (boneHeight < MIN_PLAUSIBLE_HEIGHT || boneHeight > MAX_PLAUSIBLE_HEIGHT) {
        const factor = TARGET_HEIGHT / boneHeight;
        scene.scale.multiplyScalar(factor);
        scene.updateMatrixWorld(true);
      }
      return;
    }

    minY = Infinity;
    maxY = -Infinity;
    scene.traverse((child: any) => {
      const position = child.geometry?.attributes?.position;
      if (!child.isMesh || !position) return;
      child.updateMatrixWorld();
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i);
        v.applyMatrix4(child.matrixWorld);
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    });

    if (!isFinite(minY) || !isFinite(maxY)) return;
    const height = maxY - minY;
    if (height <= 0) return;

    if (height < MIN_PLAUSIBLE_HEIGHT || height > MAX_PLAUSIBLE_HEIGHT) {
      const factor = TARGET_HEIGHT / height;
      scene.scale.multiplyScalar(factor);
      scene.updateMatrixWorld(true);
    }
  }

  private static createFailureResult(
    id: string,
    category: GarmentCategory,
    status: IngestionStatus
  ): GarmentMetadata {
    return {
      id,
      category,
      calibrationVersion: '2.0.0',
      ingestionStatus: status,
      anatomicalAnchorOffset: { x: 0, y: 0, z: 0 },
      anchorConfidence: 'LOW',
      anchorType: 'CUSTOM',
      restPoseMetricWidth: 0.5,
      boneMap: {},
      restPose: 'CUSTOM',
      autoRigged: false,
      sleeveType: 'UNKNOWN'
    };
  }
}