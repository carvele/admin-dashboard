import * as THREE from 'three';
import { STANDARD_BONES } from './garmentIngestor';

export interface Vec3 { x: number; y: number; z: number; }

export interface GLBAnalysis {
  // Geometry
  meshCount: number;
  skinnedMeshCount: number;
  vertexCount: number;
  triangleCount: number;
  boundingBox: { min: Vec3; max: Vec3 };
  boundingSize: Vec3;
  center: Vec3;

  // Skeleton
  hasSkeleton: boolean;
  hasSkinnedMesh: boolean;
  boneCount: number;
  boneNames: string[];

  // Canonical mapping attempt
  canonicalMapping: Record<string, string>; // stdBone → glbBone
  hasRequiredBones: boolean;
  missingRequiredBones: string[];

  // Routing decision
  route: 'ALREADY_RIGGED' | 'NEEDS_AUTO_RIG' | 'UNSUPPORTED';
  routeReason: string;
}

export class GarmentAnalyzer {
  public static analyze(scene: THREE.Object3D): GLBAnalysis {
    let meshCount = 0;
    let skinnedMeshCount = 0;
    let vertexCount = 0;
    let triangleCount = 0;
    
    const bones: Record<string, THREE.Bone> = {};

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        meshCount++;
        if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
          skinnedMeshCount++;
        }
        
        if (mesh.geometry) {
          const geom = mesh.geometry;
          if (geom.attributes.position) {
            vertexCount += geom.attributes.position.count;
          }
          if (geom.index) {
            triangleCount += geom.index.count / 3;
          } else if (geom.attributes.position) {
            triangleCount += geom.attributes.position.count / 3;
          }
        }
      }
      
      if ((child as THREE.Bone).isBone) {
        bones[child.name] = child as THREE.Bone;
      }
    });

    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getSize(size);
      box.getCenter(center);
    }

    const boneNames = Object.keys(bones);
    
    // Attempt mapping
    const boneMap: Record<string, string> = {};
    for (const stdBone of STANDARD_BONES) {
      if (bones[stdBone]) {
        boneMap[stdBone] = stdBone;
      } else if (bones['mixamorig' + stdBone]) {
        boneMap[stdBone] = 'mixamorig' + stdBone;
      }
    }

    const required = ['Spine', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'];
    const missing: string[] = [];
    for (const req of required) {
      if (!boneMap[req]) {
        missing.push(req);
      }
    }
    const hasRequired = missing.length === 0;

    let route: GLBAnalysis['route'] = 'UNSUPPORTED';
    let routeReason = '';

    if (meshCount === 0) {
      route = 'UNSUPPORTED';
      routeReason = 'No 3D geometry found in GLB.';
    } else if (skinnedMeshCount > 0 && hasRequired) {
      route = 'ALREADY_RIGGED';
      routeReason = 'Garment is rigged and skinned with required bones.';
    } else if (vertexCount > 50) {
      route = 'NEEDS_AUTO_RIG';
      routeReason = 'Garment contains geometry but lacks a valid skin/skeleton. Will attempt auto-rigging.';
    } else {
      route = 'UNSUPPORTED';
      routeReason = 'Geometry is too simple or invalid for rigging.';
    }

    return {
      meshCount,
      skinnedMeshCount,
      vertexCount,
      triangleCount,
      boundingBox: { 
        min: { x: box.min.x, y: box.min.y, z: box.min.z }, 
        max: { x: box.max.x, y: box.max.y, z: box.max.z } 
      },
      boundingSize: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z },
      hasSkeleton: boneNames.length > 0,
      hasSkinnedMesh: skinnedMeshCount > 0,
      boneCount: boneNames.length,
      boneNames,
      canonicalMapping: boneMap,
      hasRequiredBones: hasRequired,
      missingRequiredBones: missing,
      route,
      routeReason
    };
  }
}
