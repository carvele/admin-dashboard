import { supabase } from '../lib/supabaseClient';
import { Logger } from '../utils/Logger';

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Resolves a private-bucket object into a usable signed URL. The reservations
 * table's receipt_url column holds a bare storage path (e.g.
 * "{userId}/1234.jpg"), not a URL -- this mirrors the mobile app's
 * resolveSignedStorageUrl so staff can actually view what a customer
 * uploaded. Requires a staff-facing SELECT policy on the target bucket
 * (payment_receipts: "Staff can read payment receipts").
 */
export const resolveSignedStorageUrl = async (bucket, value) => {
  if (!value) return null;

  let objectPath = value;
  if (value.startsWith('http')) {
    const marker = `/${bucket}/`;
    const index = value.indexOf(marker);
    if (index === -1) return value;
    objectPath = value.slice(index + marker.length).split('?')[0];
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error(`[Storage] Failed to sign ${bucket}/${objectPath}:`, error?.message);
    return null;
  }
  return data.signedUrl;
};

/**
 * Uploads a file to Supabase Storage and returns the public download URL.
 */
export const uploadToSupabase = async (file, bucketName, folderPath = '') => {
  if (!file) throw new Error('No file provided');
  
  const cleanFolderName = folderPath ? (folderPath.endsWith('/') ? folderPath : `${folderPath}/`) : '';
  const fileName = `${cleanFolderName}${Date.now()}_${file.name}`;
  
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file, { upsert: false });
    
  if (error) {
    console.error('[Storage] Supabase upload failed:', error);
    throw error;
  }
  
  const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(data.path);
  return urlData.publicUrl;
};

/**
 * Legacy wrapper mapping to Supabase Storage.
 */
export const uploadFile = async (file, folderPath = 'catalog-assets') => {
  const bucketName = folderPath === 'avatars' ? 'avatars' : 'ar-models';
  return await uploadToSupabase(file, bucketName, folderPath);
};

/**
 * Routes a file to the correct storage provider based on its type.
 * - Images & Masks -> Cloudinary
 * - 3D Models (.glb, .gltf, .obj) -> Supabase Storage (ar-models bucket)
 * - User Avatars -> Supabase Storage (avatars bucket)
 */
export const routeAndUploadFile = async (file, folderPath = 'catalog-assets') => {
  if (!file) return null;

  const fileName = file.name.toLowerCase();
  const is3DModel = fileName.endsWith('.glb') || fileName.endsWith('.gltf') || fileName.endsWith('.obj');
  const isAvatar = folderPath === 'avatars';

  if (is3DModel) {
    Logger.info(`[Storage] Routing ${file.name} to Supabase Storage (ar-models)...`);
    return await uploadToSupabase(file, 'ar-models', folderPath);
  } else if (isAvatar) {
    Logger.info(`[Storage] Routing ${file.name} to Supabase Storage (avatars)...`);
    return await uploadToSupabase(file, 'avatars', folderPath);
  } else {
    Logger.info(`[Storage] Routing ${file.name} to Cloudinary...`);
    const { secure_url } = await uploadToCloudinary(file);
    return secure_url;
  }
};

/**
 * Compresses an image file using browser Canvas before upload.
 */
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return resolve(file); // Only process images
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Canvas is empty'));
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          'image/webp',
          quality
      );
    };
    img.onerror = (err) => reject(err);
  });
};

/**
 * Uploads a file to Cloudinary and returns the { secure_url, public_id } object.
 */
export const uploadToCloudinary = async (file, retries = 2) => {
  if (!file) throw new Error('No file provided');

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    const error = new Error('Cloudinary configuration missing. Please check VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in your .env file.');
    console.error('Cloudinary Config Error:', error);
    throw error;
  }

  let processedFile = file;
  try {
    processedFile = await compressImage(file);
    console.log(`[Storage] Compressed image from ${file.size} to ${processedFile.size} bytes`);
  } catch (err) {
    console.warn('[Storage] Image compression failed, uploading original', err);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('file', processedFile);
      formData.append('upload_preset', uploadPreset);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error?.message || response.statusText;
        
        if (errorMessage.includes('Invalid Cloud Name')) {
          throw new Error(`Cloudinary Error: The cloud name "${cloudName}" is invalid. Please check your .env file.`);
        }
        if (errorMessage.includes('Upload preset')) {
          throw new Error(`Cloudinary Error: The upload preset "${uploadPreset}" is invalid. Make sure it is an "Unsigned" preset.`);
        }
        
        throw new Error(`Cloudinary Upload Failed: ${errorMessage}`);
      }

      const data = await response.json();
      return {
        secure_url: data.secure_url,
        public_id: data.public_id,
      };
    } catch (error) {
      const isNetworkError = error instanceof TypeError && error.message === 'Failed to fetch';
      
      if (attempt === retries) {
        if (isNetworkError) {
          const networkError = new Error(
              'Network Error: Failed to reach Cloudinary. This may be caused by an ad-blocker (e.g., uBlock Origin), a firewall, or lack of internet connection. Please disable content blockers and try again.'
          );
          console.error('Cloudinary Network Error:', networkError);
          throw networkError;
        }
        console.error('Cloudinary upload error after retries:', error);
        throw error;
      }
      
      console.warn(`Upload attempt ${attempt + 1} failed. Retrying...`, error);
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
    }
  }
};

/**
 * Deletes a file from Supabase Storage or logs skipping if it's a Cloudinary URL.
 */
export const deleteFile = async (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return;

  if (fileUrl.includes('supabase.co/storage/v1/object/public/')) {
    try {
      const urlParts = fileUrl.split('/storage/v1/object/public/');
      if (urlParts.length < 2) return;
      const pathAndBucket = urlParts[1];
      const firstSlash = pathAndBucket.indexOf('/');
      const bucket = pathAndBucket.substring(0, firstSlash);
      const filePath = pathAndBucket.substring(firstSlash + 1);

      console.log(`[Storage] Deleting from Supabase: bucket=${bucket}, path=${filePath}`);
      const { error } = await supabase.storage.from(bucket).remove([filePath]);
      if (error) {
        console.error('[Storage] Supabase delete failed:', error);
      } else {
        console.log('[Storage] Supabase delete success');
      }
    } catch (e) {
      console.error('[Storage] Error deleting from Supabase:', e);
    }
  } else {
    console.info(`[Storage] Skipping delete for non-Supabase URL: ${fileUrl}`);
  }
};
