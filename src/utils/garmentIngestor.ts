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
    const bones: Record<string, any> = {};
    scene.traverse((child: any) => {
      if (child.isBone) bones[child.name] = child;
    });

    const boneMap = analysis.canonicalMapping;
    let restPoseMetricWidth = 0.5;
    
    const leftShoulder = bones[boneMap['LeftShoulder']] || bones[boneMap['LeftArm']];
    const rightShoulder = bones[boneMap['RightShoulder']] || bones[boneMap['RightArm']];
    if (leftShoulder && rightShoulder) {
      const lPos = new THREE.Vector3();
      const rPos = new THREE.Vector3();
      leftShoulder.getWorldPosition(lPos);
      rightShoulder.getWorldPosition(rPos);
      restPoseMetricWidth = lPos.distanceTo(rPos);
    } else {
      restPoseMetricWidth = analysis.boundingSize.x;
    }

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