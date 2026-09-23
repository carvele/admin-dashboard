import { GarmentAnalyzer } from './garmentAnalyzer';
import { GarmentAnatomyDetector } from './garmentAnatomyDetector';
import { GarmentAutoRigger } from './garmentAutoRigger';
import { GarmentValidator } from './garmentValidator';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import type {
  GarmentMetadata,
  IngestionStatus,
  GarmentCategory,
  GarmentFitProfileV2,
  FitBand,
  CoverageProfile,
  CoverageExtent,
  ReferenceMeasurements,
  DeformationProfile,
  Vec3,
} from '../types/garment';

export const UNIVERSAL_CANONICAL_BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
];

export const STANDARD_BONES = UNIVERSAL_CANONICAL_BONES;

export function getCategorySkeletonProfile(category: GarmentCategory): {
  region: 'upper' | 'lower' | 'full';
  requiredBones: string[];
  optionalBones: string[];
  displayBones: string[];
} {
  switch (category) {
    case 'pants':
      return {
        region: 'lower',
        requiredBones: ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'],
        optionalBones: ['LeftFoot', 'RightFoot', 'Spine'],
        displayBones: ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'Spine'],
      };
    case 'skirt':
      return {
        region: 'lower',
        requiredBones: ['Hips'],
        optionalBones: ['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine'],
        displayBones: ['Hips', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'Spine'],
      };
    case 'shirt':
    case 'jacket':
      return {
        region: 'upper',
        requiredBones: ['Spine', 'LeftArm', 'RightArm'],
        optionalBones: ['Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'LeftForeArm', 'RightForeArm', 'Neck'],
        displayBones: ['Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'RightShoulder', 'RightArm', 'RightForeArm', 'Neck'],
      };
    case 'dress':
      return {
        region: 'full',
        requiredBones: ['Hips', 'Spine', 'LeftArm', 'RightArm'],
        optionalBones: ['LeftShoulder', 'RightShoulder', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'],
        displayBones: ['Hips', 'Spine', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'RightShoulder', 'RightArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'],
      };
    default:
      return {
        region: 'upper',
        requiredBones: ['Spine'],
        optionalBones: ['LeftShoulder', 'RightShoulder', 'Hips'],
        displayBones: ['Spine', 'LeftShoulder', 'RightShoulder', 'Hips'],
      };
  }
}

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
    const analysis = GarmentAnalyzer.analyze(scene, category);
    
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
      
      const skelProf = getCategorySkeletonProfile(category);
      const isBottom = category === 'pants' || category === 'skirt';
      const anchorPos: Vec3 = anatomy.neck
        ? { x: anatomy.neck.position.x, y: anatomy.neck.position.y, z: anatomy.neck.position.z }
        : { x: 0, y: 0.5, z: 0 };
      const metricW = (anatomy.rightShoulder && anatomy.leftShoulder)
        ? Math.abs(anatomy.rightShoulder.position.x - anatomy.leftShoulder.position.x)
        : 0.5;

      const fitProfileV2: GarmentFitProfileV2 = {
        version: 2,
        region: skelProf.region,
        category,
        rootAnchor: {
          type: isBottom ? 'WAIST' : 'SHOULDER_CENTER',
          offset: anchorPos,
        },
        skeletonProfile: {
          requiredBones: skelProf.requiredBones,
          optionalBones: skelProf.optionalBones,
          unusedBones: UNIVERSAL_CANONICAL_BONES.filter(
            (b) => !skelProf.requiredBones.includes(b) && !skelProf.optionalBones.includes(b)
          ),
        },
        boneMap: rigResult.boneMap,
        controlPoints: {
          anchor: anchorPos,
        },
        fitBands: [
          { name: isBottom ? 'WAIST' : 'SHOULDER', heightRatio: 0.9, authoredWidthMeters: metricW },
        ],
        coverageProfile: {
          extent: 'regular',
          authoredLengthMeters: 0.65,
        },
        referenceMeasurements: {
          primaryWidthMeters: metricW,
          widthBasis: isBottom ? 'waist' : 'shoulder',
          totalLengthMeters: 0.65,
        },
      };

      return {
        id,
        category,
        calibrationVersion: '2.0.0',
        ingestionStatus: 'NEEDS_CALIBRATION',
        anatomicalAnchorOffset: anchorPos,
        anchorConfidence: anatomy.neck && anatomy.neck.confidence > 0.8 ? 'HIGH' : 'MEDIUM',
        anchorType: isBottom ? 'WAIST' : 'SHOULDER_CENTER',
        restPoseMetricWidth: metricW,
        boneMap: rigResult.boneMap,
        restPose: rigResult.restPose,
        autoRigged: true,
        sleeveType: anatomy.sleeveType,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        garmentFitProfileVersion: 2,
        fitProfileV2,
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

    // Pants/skirt are sized and anchored off the hips, not the shoulders --
    // a bottoms-only GLB's Arm/Shoulder bones (if present at all, e.g. from
    // the proxy-mannequin export workflow) carry no real relationship to the
    // garment's own fit. Every other category keeps the exact prior chain.
    const isBottomGarment = category === 'pants' || category === 'skirt';
    const isDress = category === 'dress';

    const anchorOffset = { x: 0, y: 0.5, z: 0 };
    let anchorConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    const anchorBoneKey = isBottomGarment ? 'Hips' : 'Spine2';

    if (boneMap[anchorBoneKey] && bones[boneMap[anchorBoneKey]]) {
      const anchorBone = bones[boneMap[anchorBoneKey]];
      const pos = new THREE.Vector3();
      anchorBone.getWorldPosition(pos);
      anchorOffset.x = pos.x;
      anchorOffset.y = pos.y;
      anchorOffset.z = pos.z;
      anchorConfidence = 'HIGH';
    } else {
      anchorOffset.x = analysis.center.x;
      anchorOffset.y = analysis.boundingBox.max.y;
      anchorOffset.z = analysis.center.z;
    }

    const restPoseMetricWidth = isBottomGarment
      ? (this.measureSliceWidth(scene, anchorOffset.y) ?? pairWidth('LeftUpLeg', 'RightUpLeg') ?? analysis.boundingSize.x)
      : (pairWidth('LeftArm', 'RightArm') ?? pairWidth('LeftShoulder', 'RightShoulder') ?? analysis.boundingSize.x);

    // V2 Geometry Analysis: Bounds and Slices
    const bbox = analysis.boundingBox;
    const minY = bbox.min.y;
    const maxY = bbox.max.y;
    const totalLength = Math.max(0.05, maxY - minY);

    const fitBands: FitBand[] = [];
    const controlPoints: Record<string, Vec3> = {};

    if (isBottomGarment) {
      const waistY = minY + totalLength * 0.95;
      const hipY = minY + totalLength * 0.80;
      const thighY = minY + totalLength * 0.60;
      const kneeY = minY + totalLength * 0.35;
      const hemY = minY + totalLength * 0.05;

      const waistSlice = this.measureSliceDetailed(scene, waistY);
      const hipSlice = this.measureSliceDetailed(scene, hipY);
      const thighSlice = this.measureSliceDetailed(scene, thighY);
      const kneeSlice = this.measureSliceDetailed(scene, kneeY);
      const hemSlice = this.measureSliceDetailed(scene, hemY);

      const baseW = restPoseMetricWidth;
      const waistW = waistSlice?.width ?? baseW;
      const hipW = hipSlice?.width ?? (baseW * 1.12);
      const thighW = thighSlice?.width ?? (baseW * 0.82);
      const kneeW = kneeSlice?.width ?? (baseW * 0.52);
      const hemW = hemSlice?.width ?? (baseW * 0.46);

      fitBands.push(
        { name: 'WAIST', heightRatio: 0.95, authoredWidthMeters: waistW },
        { name: 'HIP', heightRatio: 0.80, authoredWidthMeters: hipW },
        { name: 'UPPER_THIGH', heightRatio: 0.60, authoredWidthMeters: thighW },
        { name: 'KNEE', heightRatio: 0.35, authoredWidthMeters: kneeW },
        { name: 'HEM', heightRatio: 0.05, authoredWidthMeters: hemW }
      );

      controlPoints['waistCenter'] = waistSlice?.center ?? { x: anchorOffset.x, y: waistY, z: anchorOffset.z };
      controlPoints['leftWaistEdge'] = { x: waistSlice ? waistSlice.maxX : (anchorOffset.x + waistW / 2), y: waistY, z: anchorOffset.z };
      controlPoints['rightWaistEdge'] = { x: waistSlice ? waistSlice.minX : (anchorOffset.x - waistW / 2), y: waistY, z: anchorOffset.z };
      controlPoints['leftHipRegion'] = { x: hipSlice ? hipSlice.maxX : (anchorOffset.x + hipW / 2), y: hipY, z: anchorOffset.z };
      controlPoints['rightHipRegion'] = { x: hipSlice ? hipSlice.minX : (anchorOffset.x - hipW / 2), y: hipY, z: anchorOffset.z };
      controlPoints['leftKneeRegion'] = { x: kneeSlice ? kneeSlice.maxX : (anchorOffset.x + kneeW / 2), y: kneeY, z: anchorOffset.z };
      controlPoints['rightKneeRegion'] = { x: kneeSlice ? kneeSlice.minX : (anchorOffset.x - kneeW / 2), y: kneeY, z: anchorOffset.z };
      controlPoints['leftHem'] = { x: hemSlice ? hemSlice.maxX : (anchorOffset.x + hemW / 2), y: hemY, z: anchorOffset.z };
      controlPoints['rightHem'] = { x: hemSlice ? hemSlice.minX : (anchorOffset.x - hemW / 2), y: hemY, z: anchorOffset.z };
    } else if (isDress) {
      const shoulderY = minY + totalLength * 0.92;
      const chestY = minY + totalLength * 0.78;
      const waistY = minY + totalLength * 0.55;
      const hipY = minY + totalLength * 0.38;
      const hemY = minY + totalLength * 0.05;

      const shoulderW = restPoseMetricWidth;
      const chestSlice = this.measureSliceDetailed(scene, chestY);
      const waistSlice = this.measureSliceDetailed(scene, waistY);
      const hipSlice = this.measureSliceDetailed(scene, hipY);
      const hemSlice = this.measureSliceDetailed(scene, hemY);

      fitBands.push(
        { name: 'SHOULDER', heightRatio: 0.92, authoredWidthMeters: shoulderW },
        { name: 'CHEST', heightRatio: 0.78, authoredWidthMeters: chestSlice?.width ?? (shoulderW * 0.95) },
        { name: 'WAIST', heightRatio: 0.55, authoredWidthMeters: waistSlice?.width ?? (shoulderW * 0.85) },
        { name: 'HIP', heightRatio: 0.38, authoredWidthMeters: hipSlice?.width ?? (shoulderW * 1.05) },
        { name: 'HEM', heightRatio: 0.05, authoredWidthMeters: hemSlice?.width ?? (shoulderW * 1.1) }
      );

      controlPoints['leftShoulderEdge'] = { x: anchorOffset.x + shoulderW / 2, y: shoulderY, z: anchorOffset.z };
      controlPoints['rightShoulderEdge'] = { x: anchorOffset.x - shoulderW / 2, y: shoulderY, z: anchorOffset.z };
      controlPoints['chestCenter'] = chestSlice?.center ?? { x: anchorOffset.x, y: chestY, z: anchorOffset.z };
      controlPoints['waistCenter'] = waistSlice?.center ?? { x: anchorOffset.x, y: waistY, z: anchorOffset.z };
      controlPoints['hemCenter'] = hemSlice?.center ?? { x: anchorOffset.x, y: hemY, z: anchorOffset.z };
    } else {
      const shoulderY = minY + totalLength * 0.90;
      const chestY = minY + totalLength * 0.72;
      const waistY = minY + totalLength * 0.38;
      const hemY = minY + totalLength * 0.08;

      const shoulderW = restPoseMetricWidth;
      const chestSlice = this.measureSliceDetailed(scene, chestY);
      const waistSlice = this.measureSliceDetailed(scene, waistY);
      const hemSlice = this.measureSliceDetailed(scene, hemY);

      fitBands.push(
        { name: 'SHOULDER', heightRatio: 0.90, authoredWidthMeters: shoulderW },
        { name: 'CHEST', heightRatio: 0.72, authoredWidthMeters: chestSlice?.width ?? (shoulderW * 0.95) },
        { name: 'WAIST', heightRatio: 0.38, authoredWidthMeters: waistSlice?.width ?? (shoulderW * 0.88) },
        { name: 'HEM', heightRatio: 0.08, authoredWidthMeters: hemSlice?.width ?? (shoulderW * 0.92) }
      );

      controlPoints['leftShoulderEdge'] = { x: anchorOffset.x + shoulderW / 2, y: shoulderY, z: anchorOffset.z };
      controlPoints['rightShoulderEdge'] = { x: anchorOffset.x - shoulderW / 2, y: shoulderY, z: anchorOffset.z };
      controlPoints['chestCenter'] = chestSlice?.center ?? { x: anchorOffset.x, y: chestY, z: anchorOffset.z };
      controlPoints['waistCenter'] = waistSlice?.center ?? { x: anchorOffset.x, y: waistY, z: anchorOffset.z };
      controlPoints['hemCenter'] = hemSlice?.center ?? { x: anchorOffset.x, y: hemY, z: anchorOffset.z };
    }

    let extent: CoverageExtent = 'regular';
    if (isBottomGarment) {
      extent = totalLength < 0.5 ? 'shorts' : 'full';
    } else {
      extent = totalLength < 0.45 ? 'crop' : totalLength > 0.85 ? 'longline' : 'regular';
    }

    const coverageProfile: CoverageProfile = {
      extent,
      authoredLengthMeters: totalLength,
    };

    const referenceMeasurements: ReferenceMeasurements = {
      primaryWidthMeters: restPoseMetricWidth,
      widthBasis: isBottomGarment ? 'waist' : 'shoulder',
      totalLengthMeters: totalLength,
      waistWidthMeters: isBottomGarment ? fitBands.find(b => b.name === 'WAIST')?.authoredWidthMeters : undefined,
      hipWidthMeters: isBottomGarment ? fitBands.find(b => b.name === 'HIP')?.authoredWidthMeters : undefined,
      inseamMeters: isBottomGarment ? totalLength * 0.75 : undefined,
    };

    const supportedMorphs: string[] = [];
    scene.traverse((child: any) => {
      if (child.isMesh && child.morphTargetDictionary) {
        for (const name of Object.keys(child.morphTargetDictionary)) {
          if (!supportedMorphs.includes(name)) supportedMorphs.push(name);
        }
      }
    });

    const deformationProfile: DeformationProfile | undefined =
      supportedMorphs.length > 0 ? { supportedMorphs } : undefined;

    const skelProfile = getCategorySkeletonProfile(category);
    const requiredBones = skelProfile.requiredBones;
    const optionalBones = skelProfile.optionalBones;
    const unusedBones = UNIVERSAL_CANONICAL_BONES.filter(
      (b) => !requiredBones.includes(b) && !optionalBones.includes(b)
    );

    const fitProfileV2: GarmentFitProfileV2 = {
      version: 2,
      region: skelProfile.region,
      category,
      rootAnchor: {
        type: isBottomGarment ? 'WAIST' : 'SHOULDER_CENTER',
        offset: anchorOffset,
      },
      skeletonProfile: {
        requiredBones,
        optionalBones,
        unusedBones,
      },
      boneMap,
      controlPoints,
      fitBands,
      coverageProfile,
      referenceMeasurements,
      deformationProfile,
    };

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
      sleeveType: 'UNKNOWN',
      garmentFitProfileVersion: 2,
      fitProfileV2,
    };
  }

  public static measureSliceDetailed(
    scene: any,
    sliceCenterY: number
  ): { width: number; minX: number; maxX: number; center: Vec3 } | null {
    const SLICE_HALF_HEIGHT = 0.04;
    let minX = Infinity, maxX = -Infinity;
    let sumZ = 0, count = 0;
    const v = new THREE.Vector3();
    scene.traverse((child: any) => {
      const position = child.geometry?.attributes?.position;
      if (!child.isMesh || !position) return;
      child.updateMatrixWorld();
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i);
        v.applyMatrix4(child.matrixWorld);
        if (Math.abs(v.y - sliceCenterY) <= SLICE_HALF_HEIGHT) {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          sumZ += v.z;
          count++;
        }
      }
    });
    if (!isFinite(minX) || !isFinite(maxX) || count === 0) return null;
    const width = maxX - minX;
    if (width <= 0.01) return null;
    return {
      width,
      minX,
      maxX,
      center: { x: (minX + maxX) / 2, y: sliceCenterY, z: sumZ / count },
    };
  }

  private static measureSliceWidth(scene: any, sliceCenterY: number): number | null {
    const detailed = this.measureSliceDetailed(scene, sliceCenterY);
    return detailed ? detailed.width : null;
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
    const skelProf = getCategorySkeletonProfile(category);
    const isBottom = category === 'pants' || category === 'skirt';
    return {
      id,
      category,
      calibrationVersion: '2.0.0',
      ingestionStatus: status,
      anatomicalAnchorOffset: { x: 0, y: 0, z: 0 },
      anchorConfidence: 'LOW',
      anchorType: isBottom ? 'WAIST' : 'SHOULDER_CENTER',
      restPoseMetricWidth: 0.5,
      boneMap: {},
      restPose: 'CUSTOM',
      autoRigged: false,
      sleeveType: 'UNKNOWN',
      garmentFitProfileVersion: 2,
      fitProfileV2: {
        version: 2,
        region: skelProf.region,
        category,
        rootAnchor: {
          type: isBottom ? 'WAIST' : 'SHOULDER_CENTER',
          offset: { x: 0, y: 0, z: 0 },
        },
        skeletonProfile: {
          requiredBones: skelProf.requiredBones,
          optionalBones: skelProf.optionalBones,
          unusedBones: UNIVERSAL_CANONICAL_BONES.filter(
            (b) => !skelProf.requiredBones.includes(b) && !skelProf.optionalBones.includes(b)
          ),
        },
        boneMap: {},
        controlPoints: {},
        fitBands: [],
        coverageProfile: {
          extent: 'regular',
          authoredLengthMeters: 0.5,
        },
        referenceMeasurements: {
          primaryWidthMeters: 0.5,
          widthBasis: isBottom ? 'waist' : 'shoulder',
          totalLengthMeters: 0.5,
        },
      },
    };
  }
}