/**
 * Pose-quality checks and body-ratio extraction for the body-scan flow.
 *
 * Landmark detection itself is handled by react-native-mediapipe-posedetection
 * (usePoseDetection), which produces the standard MediaPipe BlazePose 33-point
 * landmark layout. This file only contains the measurement logic that operates
 * on that layout -- it is detector-agnostic as long as the input follows the
 * same indices.
 *
 * BlazePose landmark indices (0-32):
 *   0  = nose          11 = left_shoulder   12 = right_shoulder
 *   13 = left_elbow    14 = right_elbow     15 = left_wrist
 *   16 = right_wrist   23 = left_hip        24 = right_hip
 *   25 = left_knee     26 = right_knee      27 = left_ankle
 *   28 = right_ankle
 */

export interface Landmark {
  x: number;      // normalized [0, 1] horizontal position
  y: number;      // normalized [0, 1] vertical position
  z?: number;     // depth (relative, less reliable from single camera)
  visibility: number; // confidence [0, 1]
}

export interface WorldLandmark extends Landmark {
  z: number;      // Metric depth in meters
}

export interface StageLandmark extends Landmark {
  z: number;
}

export interface BodyRatios {
  // All values in normalized pixel space (relative to frame height)
  shoulderWidthRatio: number;      // shoulder-to-shoulder span / frame height
  hipWidthRatio: number;           // hip-to-hip span / frame height
  torsoLengthRatio: number;        // mid-shoulder to mid-hip / frame height
  armLengthRatio: number;          // shoulder to wrist (left avg'd with right) / frame height
  legLengthRatio: number;          // hip to ankle (left avg'd with right) / frame height
  inseamRatio: number;             // mid-hip to ankle / frame height
  headToAnkleRatio: number;        // total body span for height calibration
  bustWidthRatio: number;          // axillary shoulder width proxy / frame height
  rawWaistWidthRatio?: number;     // 3D anatomical waistline width / frame height
}

// Key landmark indices used for measurement extraction
const L = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13,    rightElbow: 14,
  leftWrist: 15,    rightWrist: 16,
  leftHip: 23,      rightHip: 24,
  leftKnee: 25,     rightKnee: 26,
  leftAnkle: 27,    rightAnkle: 28,
} as const;

// Key joints that must be visible for a "full body" pose
const REQUIRED_JOINTS = [
  L.nose, L.leftShoulder, L.rightShoulder,
  L.leftHip, L.rightHip, L.leftKnee, L.rightKnee,
  L.leftAnkle, L.rightAnkle,
];

/**
 * Returns true when detected pose meets capture quality requirements:
 * - All required joints visible with confidence >85%
 * - Overall mean confidence >85%
 * - Person occupies at least 50% of frame height
 */
export function isPoseValid(landmarks: Landmark[]): boolean {
  if (landmarks.length < 33) return false;

  const allKeyJointsVisible = REQUIRED_JOINTS.every(
    (idx: number) => landmarks[idx].visibility >= 0.85
  );
  if (!allKeyJointsVisible) return false;

  const meanConfidence =
    REQUIRED_JOINTS.reduce((sum: number, idx: number) => sum + landmarks[idx].visibility, 0) /
    REQUIRED_JOINTS.length;
  if (meanConfidence < 0.85) return false;

  // Check body height spans at least 50% of the normalized frame
  const nose = landmarks[L.nose];
  const ankleY = (landmarks[L.leftAnkle].y + landmarks[L.rightAnkle].y) / 2;
  const bodySpan = Math.abs(ankleY - nose.y);
  if (bodySpan < 0.5) return false;

  return true;
}

export type PoseOrientation = 'front' | 'side' | 'unknown';

/**
 * Whether the person is facing the camera or standing in profile.
 *
 * Uses shoulder separation relative to torso length rather than raw pixels,
 * so it holds at any distance. Facing forward the shoulders are far apart
 * horizontally; in profile one shoulder occludes the other and they collapse
 * towards the same x. The band between the two thresholds is deliberately
 * left 'unknown' -- a half-turn measures neither width nor depth honestly,
 * and accepting it would quietly corrupt the result.
 */
export function getPoseOrientation(landmarks: Landmark[]): PoseOrientation {
  if (landmarks.length < 33) return 'unknown';

  const shoulderSpan = Math.abs(
    landmarks[L.leftShoulder].x - landmarks[L.rightShoulder].x,
  );
  const midShoulderY = (landmarks[L.leftShoulder].y + landmarks[L.rightShoulder].y) / 2;
  const midHipY = (landmarks[L.leftHip].y + landmarks[L.rightHip].y) / 2;
  const torso = Math.abs(midHipY - midShoulderY);
  if (torso < 0.05) return 'unknown';

  const ratio = shoulderSpan / torso;
  if (ratio > 0.55) return 'front';
  if (ratio < 0.28) return 'side';
  return 'unknown';
}

/**
 * A profile pose hides the far half of the body, so the front check's
 * demand that every joint be clearly visible can never be met. This asks
 * only for the near-side chain plus a full head-to-ankle span.
 */
export function isSidePoseValid(landmarks: Landmark[]): boolean {
  if (landmarks.length < 33) return false;
  if (getPoseOrientation(landmarks) !== 'side') return false;

  // Best-visible of each pair: whichever side is facing the camera.
  const bestOf = (a: number, b: number) =>
    Math.max(landmarks[a].visibility, landmarks[b].visibility);

  const nearSideVisible =
    bestOf(L.leftShoulder, L.rightShoulder) >= 0.8 &&
    bestOf(L.leftHip, L.rightHip) >= 0.8 &&
    bestOf(L.leftKnee, L.rightKnee) >= 0.7 &&
    bestOf(L.leftAnkle, L.rightAnkle) >= 0.7;
  if (!nearSideVisible) return false;

  const ankleY = (landmarks[L.leftAnkle].y + landmarks[L.rightAnkle].y) / 2;
  return Math.abs(ankleY - landmarks[L.nose].y) >= 0.5;
}

/**
 * Computes the overall pose confidence score (0-1).
 */
export function getPoseConfidence(landmarks: Landmark[]): number {
  if (landmarks.length < 33) return 0;
  return (
    REQUIRED_JOINTS.reduce((sum: number, idx: number) => sum + landmarks[idx].visibility, 0) /
    REQUIRED_JOINTS.length
  );
}

import type { BodyCoordinateFrame, Vec3 } from '../types/pose';

/**
 * Normalizes a 3D vector
 */
function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 1e-6) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Cross product of two 3D vectors
 */
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

/**
 * Builds a robust Body Coordinate Frame from the torso polygon using Metric 3D world landmarks.
 * Assumes a coordinate system where +X is right, +Y is up (or down), and handles them correctly.
 * For MediaPipe world landmarks: +X is right, +Y is down, +Z is forward/away from camera.
 * 
 * - Right axis: Left shoulder -> Right shoulder
 * - Up axis: Mid-hip -> Mid-shoulder
 * - Forward axis: Cross product of Right and Up
 */
export function extractBodyCoordinateFrame(landmarks: Landmark[]): BodyCoordinateFrame {
  if (landmarks.length < 33) {
    return {
      origin: { x: 0, y: 0, z: 0 },
      right: { x: 1, y: 0, z: 0 },
      up: { x: 0, y: -1, z: 0 },
      forward: { x: 0, y: 0, z: 1 }
    };
  }

  const leftShoulder = landmarks[L.leftShoulder];
  const rightShoulder = landmarks[L.rightShoulder];
  const leftHip = landmarks[L.leftHip];
  const rightHip = landmarks[L.rightHip];

  const midShoulder = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2
  };

  const midHip = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2
  };

  // Right axis: vector pointing from left shoulder to right shoulder
  const rightRaw = {
    x: rightShoulder.x - leftShoulder.x,
    y: rightShoulder.y - leftShoulder.y,
    z: (rightShoulder.z ?? 0) - (leftShoulder.z ?? 0)
  };
  const right = normalize(rightRaw);

  // Up axis: vector pointing from mid-hip to mid-shoulder
  // In MediaPipe, Y is down, so midShoulder.y < midHip.y. 
  // If we want 'up' to point anatomically up towards the head, we use midShoulder - midHip
  // which will have a negative Y component in MediaPipe space.
  const upRaw = {
    x: midShoulder.x - midHip.x,
    y: midShoulder.y - midHip.y,
    z: (midShoulder.z ?? 0) - (midHip.z ?? 0)
  };
  const upNormalized = normalize(upRaw);
  
  // Forward axis: orthogonal to right and up.
  // In a right-handed system (X right, Y down, Z away):
  // right x up points backwards (-Z) towards camera.
  // Let's ensure forward points IN towards the scene (+Z in MediaPipe).
  const forwardRaw = cross(right, upNormalized);
  const forward = normalize(forwardRaw);
  
  // Enforce strict Gram-Schmidt orthogonalization for 'up'
  // so that (right, up, forward) is a perfectly orthogonal 3D basis.
  const up = cross(forward, right);

  return {
    origin: midShoulder,
    right,
    up,
    forward
  };
}

/**
 * Extracts normalized body proportion ratios from landmarks.
 * All ratios are relative to the measured anatomical nose-to-ankle span.
 * Note: Z-coordinates in these distances are uncalibrated and relative;
 * they are NOT true metric 3D distances.
 */
export function extractBodyRatios(landmarks: Landmark[]): BodyRatios {
  const lm = landmarks;

  const dist2D = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (a: Landmark, b: Landmark) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const midShoulder = getMidpoint(lm[L.leftShoulder], lm[L.rightShoulder]);
  const midHip = getMidpoint(lm[L.leftHip], lm[L.rightHip]);
  const midAnkle = getMidpoint(lm[L.leftAnkle], lm[L.rightAnkle]);

  const headToShoulder = dist2D(lm[L.nose], midShoulder);
  const torsoLength = dist2D(midShoulder, midHip);
  const legLengthBase = dist2D(midHip, midAnkle);

  // Use the directly observable anatomical span as the denominator,
  // without applying unverified 0.83 stature assumptions.
  const visualBodySpan = Math.max(0.01, headToShoulder + torsoLength + legLengthBase);

  const shoulderWidth = dist2D(lm[L.leftShoulder], lm[L.rightShoulder]);
  const hipWidth = dist2D(lm[L.leftHip], lm[L.rightHip]);

  const leftArm = dist2D(lm[L.leftShoulder], lm[L.leftElbow]) + dist2D(lm[L.leftElbow], lm[L.leftWrist]);
  const rightArm = dist2D(lm[L.rightShoulder], lm[L.rightElbow]) + dist2D(lm[L.rightElbow], lm[L.rightWrist]);
  const armLength = (leftArm + rightArm) / 2;

  const leftLeg = dist2D(lm[L.leftHip], lm[L.leftKnee]) + dist2D(lm[L.leftKnee], lm[L.leftAnkle]);
  const rightLeg = dist2D(lm[L.rightHip], lm[L.rightKnee]) + dist2D(lm[L.rightKnee], lm[L.rightAnkle]);
  const legLength = (leftLeg + rightLeg) / 2;

  // Derive uncalibrated ratios
  return {
    shoulderWidthRatio:  shoulderWidth / visualBodySpan,
    hipWidthRatio:       hipWidth / visualBodySpan,
    torsoLengthRatio:    torsoLength / visualBodySpan,
    armLengthRatio:      armLength / visualBodySpan,
    legLengthRatio:      legLength / visualBodySpan,
    inseamRatio:         (legLengthBase * 0.92) / visualBodySpan,
    headToAnkleRatio:    1.0, // Baseline normalized to itself
    bustWidthRatio:      (shoulderWidth * 1.05) / visualBodySpan,
  };
}
