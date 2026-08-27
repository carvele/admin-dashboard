export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface WorldLandmark extends Landmark {}
export interface StageLandmark extends Landmark {}
