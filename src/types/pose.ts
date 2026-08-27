import type { Landmark, WorldLandmark, StageLandmark } from '../utils/poseDetector';
import type { TrackingState } from '../utils/trackingState';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface BodyCoordinateFrame {
  origin: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

export interface BodyOrientation {
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  isFacingForward: boolean;
  isBackFacing: boolean;
}

export interface BodyPose {
  /** The local orthonormal basis vectors representing the torso's orientation in 3D metric world space */
  coordinateFrame: BodyCoordinateFrame;
  /** Raw normalized landmarks directly from the pose detector [0, 1] */
  normalizedLandmarks: Landmark[];
  /** Canonical stage pixel coordinates (accounting for video cover/crop/mirroring) */
  stageLandmarks: StageLandmark[];
  /** Temporally smoothed 3D metric world coordinates (camera-relative meters) */
  worldLandmarks: WorldLandmark[];
  /** MediaPipe Segmentation Mask (if outputSegmentationMasks: true) */
  segmentationMask?: any;
  /** Euler angles and boolean flags representing the overall body orientation derived from the 3D basis */
  orientation: BodyOrientation;
  /** The current confidence state of the tracking (e.g., GOOD_FIT, TURN_TOO_FAR) */
  trackingState: TrackingState;
  /** Overall confidence score of the pose [0, 1] */
  confidence: number;
}

export interface TransformContext {
  videoWidth: number;
  videoHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  cropX: number;
  cropY: number;
}

export interface SegmentationFrame {
  width: number;
  height: number;
  timestamp: number;
  source: 'web-image-bitmap' | 'web-gpu-texture' | 'native-buffer';
  data: unknown; // Platform-specific backing object/handle
}

export interface PoseFrame {
  normalizedLandmarks: Landmark[];
  worldLandmarks: WorldLandmark[];
  segmentation?: SegmentationFrame;
  stageTransform?: TransformContext;
  timestamp: number;
}

export interface BodyDepthField {
  width: number;
  height: number;
  // Depth in renderer-compatible camera depth space
  depthTexture: unknown;
  // Person/body coverage
  segmentationTexture?: unknown;
  // Optional confidence/reliability texture
  confidenceTexture?: unknown; 
  timestamp: number;
}

export interface GarmentDimensions {
  shoulderWidthPx: number;
  chestWidthPx: number;
  lengthPx: number;
}

export interface GarmentFitState {
  /** The 2D/3D focal point where the garment is attached to the body */
  anchor: Vec3;
  /** Scale factors to apply to the garment mesh or image */
  scale: Vec3;
  /** Rotation to apply to the garment */
  rotation: Quaternion;
  /** Physical or pixel dimensions of the scaled garment */
  dimensions: GarmentDimensions;
  /** Fit confidence score [0, 1] */
  confidence: number;
}
