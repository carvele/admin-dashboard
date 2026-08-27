import type { Vec3 } from './pose';

export type GarmentCategory = 'shirt' | 'dress' | 'jacket' | 'pants' | 'skirt';

export interface GarmentFitProfile {
  category: GarmentCategory;

  anchors: {
    neck?: Vec3;
    leftShoulder?: Vec3;
    rightShoulder?: Vec3;
    leftHip?: Vec3;
    rightHip?: Vec3;
    waist?: Vec3;
  };

  dimensions: {
    shoulderWidth: number;
    chestWidth: number;
    waistWidth?: number;
    length: number;
    sleeveLength?: number;
  };

  rig?: {
    skeletonUrl: string;
    meshUrl: string;
  };
}

export type IngestionStatus = 'AR_READY' | 'NEEDS_MERCHANT_MAPPING' | 'NOT_AR_COMPATIBLE';

export interface GarmentMetadata {
  id: string;
  category: GarmentCategory;
  
  // Phase 5 Calibration Data
  calibrationVersion: string;
  ingestionStatus: IngestionStatus;
  
  // Predictable offset from the garment's origin to the anatomical anchor (e.g. neck)
  anatomicalAnchorOffset: Vec3;
  anchorConfidence: 'detected' | 'inferred' | 'merchant_confirmed';
  
  // Baseline metric width in meters (e.g. shoulder-to-shoulder in rest pose)
  restPoseMetricWidth: number;
  
  // Mapping of arbitrary GLB bone names to our standard canonical rig
  boneMap: Record<string, string>;
  
  // Whether this garment is modeled in T-pose or A-pose
  restPose: 'T_POSE' | 'A_POSE' | 'CUSTOM';
}
