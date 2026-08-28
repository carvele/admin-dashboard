import * as THREE from 'three';
import type { Vec3 } from './garmentAnalyzer';

export interface Landmark {
  position: Vec3;
  confidence: number;
}

export interface AnatomyLandmarks {
  neck?: Landmark;
  leftShoulder?: Landmark;
  rightShoulder?: Landmark;
  leftSleeveEnd?: Landmark;
  rightSleeveEnd?: Landmark;
  leftElbow?: Landmark;
  rightElbow?: Landmark;
  chest?: Landmark;
  waist?: Landmark;
  hem?: Landmark;
  leftHip?: Landmark;
  rightHip?: Landmark;
  
  sleeveType: 'LONG' | 'SHORT' | 'SLEEVELESS' | 'UNKNOWN';
  warnings: string[];
}

interface SliceData {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  count: number;
  center: Vec3;
}

export class GarmentAnatomyDetector {
  public static detect(scene: THREE.Object3D): AnatomyLandmarks {
    const warnings: string[] = [];
    const SLICES = 30;
    
    // 1. Gather all vertices globally
    const vertices: THREE.Vector3[] = [];
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const position = mesh.geometry.attributes.position;
        if (!position) return;
        
        mesh.updateMatrixWorld();
        const v = new THREE.Vector3();
        
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i);
          v.applyMatrix4(mesh.matrixWorld);
          vertices.push(v.clone());
        }
      }
    });

    if (vertices.length === 0) {
      warnings.push("No vertices found for anatomy detection.");
      return { sleeveType: 'UNKNOWN', warnings };
    }

    // 2. Find global bounds
    let minY = Infinity, maxY = -Infinity;
    let minX = Infinity, maxX = -Infinity;
    
    for (const v of vertices) {
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
    }
    
    const height = maxY - minY;
    
    // 3. Slice vertices into buckets
    const slices: SliceData[] = Array(SLICES).fill(null).map(() => ({
      minX: Infinity, maxX: -Infinity,
      minZ: Infinity, maxZ: -Infinity,
      count: 0,
      center: { x: 0, y: 0, z: 0 }
    }));

    for (const v of vertices) {
      // normalized Y from 0 (bottom) to 1 (top)
      const normY = (v.y - minY) / height;
      let bucket = Math.floor(normY * SLICES);
      if (bucket >= SLICES) bucket = SLICES - 1;
      if (bucket < 0) bucket = 0;
      
      const s = slices[bucket];
      s.count++;
      if (v.x < s.minX) s.minX = v.x;
      if (v.x > s.maxX) s.maxX = v.x;
      if (v.z < s.minZ) s.minZ = v.z;
      if (v.z > s.maxZ) s.maxZ = v.z;
      s.center.x += v.x;
      s.center.y += v.y;
      s.center.z += v.z;
    }

    // Compute averages for populated slices
    const validSlices: { index: number; yNorm: number; yWorld: number; width: number; s: SliceData }[] = [];
    for (let i = 0; i < SLICES; i++) {
      const s = slices[i];
      if (s.count > 0) {
        s.center.x /= s.count;
        s.center.y /= s.count;
        s.center.z /= s.count;
        validSlices.push({
          index: i,
          yNorm: i / SLICES,
          yWorld: s.center.y,
          width: s.maxX - s.minX,
          s
        });
      }
    }

    if (validSlices.length < 5) {
      warnings.push("Too few valid slices for reliable anatomy detection.");
      return { sleeveType: 'UNKNOWN', warnings };
    }

    // 4. Find Key Regions
    // Neck: Topmost valid slice
    const neckSlice = validSlices[validSlices.length - 1];
    const neck: Landmark = {
      position: { ...neckSlice.s.center },
      confidence: 0.9
    };

    // Shoulders: Widest slice in the top 30% of the garment
    let maxShoulderWidth = 0;
    let shoulderSlice = neckSlice;
    for (let i = validSlices.length - 1; i >= 0; i--) {
      const vs = validSlices[i];
      if (vs.yNorm < 0.7) break; // Look only in top 30%
      if (vs.width > maxShoulderWidth) {
        maxShoulderWidth = vs.width;
        shoulderSlice = vs;
      }
    }

    const leftShoulder: Landmark = {
      position: { x: shoulderSlice.s.minX + maxShoulderWidth * 0.1, y: shoulderSlice.yWorld, z: shoulderSlice.s.center.z },
      confidence: 0.8
    };
    const rightShoulder: Landmark = {
      position: { x: shoulderSlice.s.maxX - maxShoulderWidth * 0.1, y: shoulderSlice.yWorld, z: shoulderSlice.s.center.z },
      confidence: 0.8
    };

    // Waist: Narrowest slice in the middle (40% to 70%)
    let minWaistWidth = Infinity;
    let waistSlice = validSlices[Math.floor(validSlices.length / 2)];
    for (const vs of validSlices) {
      if (vs.yNorm > 0.3 && vs.yNorm < 0.7) {
        if (vs.width < minWaistWidth) {
          minWaistWidth = vs.width;
          waistSlice = vs;
        }
      }
    }

    const waist: Landmark = {
      position: { ...waistSlice.s.center },
      confidence: 0.85
    };

    // Hem: Bottommost slice
    const hemSlice = validSlices[0];
    const hem: Landmark = {
      position: { ...hemSlice.s.center },
      confidence: 0.9
    };

    // 5. Sleeve Analysis
    // Are the overall bounds much wider than the waist?
    const totalWidth = maxX - minX;
    let sleeveType: 'LONG' | 'SHORT' | 'SLEEVELESS' = 'UNKNOWN';
    let leftSleeveEnd: Landmark | undefined;
    let rightSleeveEnd: Landmark | undefined;
    
    if (totalWidth > minWaistWidth * 1.8) {
      sleeveType = 'LONG';
    } else if (totalWidth > minWaistWidth * 1.3) {
      sleeveType = 'SHORT';
    } else {
      sleeveType = 'SLEEVELESS';
    }

    if (sleeveType !== 'SLEEVELESS') {
      // Find the slice containing the extreme X coordinates
      let leftEndSlice = validSlices[0];
      let rightEndSlice = validSlices[0];
      
      for (const vs of validSlices) {
        if (vs.s.minX <= minX + 0.05) leftEndSlice = vs;
        if (vs.s.maxX >= maxX - 0.05) rightEndSlice = vs;
      }
      
      leftSleeveEnd = {
        position: { x: minX, y: leftEndSlice.yWorld, z: leftEndSlice.s.center.z },
        confidence: 0.7
      };
      
      rightSleeveEnd = {
        position: { x: maxX, y: rightEndSlice.yWorld, z: rightEndSlice.s.center.z },
        confidence: 0.7
      };
    }

    return {
      neck,
      leftShoulder,
      rightShoulder,
      waist,
      hem,
      leftSleeveEnd,
      rightSleeveEnd,
      sleeveType,
      warnings
    };
  }
}
