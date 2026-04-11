import { storage } from './config';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage and returns the public download URL.
 */
export const uploadFile = async (file, folderPath = 'catalog-assets') => {
  if (!file) throw new Error('No file provided');
  
  const fileName = `${Date.now()}_${file.name}`;
  const storageRef = ref(storage, `${folderPath}/${fileName}`);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // Handle progress if needed
      },
      (error) => {
        console.error('[Storage] Firebase upload failed:', error);
        reject(error);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadURL);
      }
    );
  });
};

/**
 * Routes a file to the correct storage provider based on its type.
 * - Images & Masks -> Cloudinary
 * - 3D Models (.glb, .obj) -> Firebase Storage
 * - User Avatars -> Firebase Storage
 */
export const routeAndUploadFile = async (file, folderPath = 'catalog-assets') => {
  if (!file) return null;

  const fileName = file.name.toLowerCase();
  const is3DModel = fileName.endsWith('.glb') || fileName.endsWith('.obj');
  const isAvatar = folderPath === 'avatars';

  if (is3DModel || isAvatar) {
    console.log(`[Storage] Routing ${file.name} to Firebase Storage...`);
    return await uploadFile(file, folderPath);
  } else {
    const provider = import.meta.env.VITE_UPLOAD_PROVIDER || 'cloudinary';
    
    if (provider === 'firebase') {
      console.log(`[Storage] Routing ${file.name} to Firebase Storage (Provider: firebase)...`);
      return await uploadFile(file, folderPath);
    } else {
      console.log(`[Storage] Routing ${file.name} to Cloudinary (Provider: ${provider})...`);
      const { secure_url } = await uploadToCloudinary(file);
      return secure_url;
    }
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
          // Use webp to preserve transparency instead of jpeg
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
 *
 * @param {File} file - The file object from an input element.
 * @returns {Promise<Object>} An object containing secure_url and public_id
 */
export const uploadToCloudinary = async (file, retries = 2) => {
  if (!file) throw new Error('No file provided');

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  // Validate configuration
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
        
        // Provide specific guidance for common Cloudinary errors
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
      // Distinguish between fetch failure (network) and API failure (handled above)
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
      await new Promise((res) => setTimeout(res, 1000 * (attempt + 1))); // Incremental backoff
    }
  }
};

/**
 * Deletes a file from Firebase Storage given its full public URL.
 *
 * @param {string} fileUrl - The public download URL of the file to delete
 */
export const deleteFile = async (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return;

  // Guard: Only attempt deletion if it's a Firebase Storage URL
  if (!fileUrl.includes('firebasestorage.googleapis.com')) {
    console.info(`[Storage] Skipping delete for non-Firebase URL: ${fileUrl}`);
    return;
  }

  try {
    // 1. Extract the file path from the complex Firebase Storage URL
    const decodedUrl = decodeURIComponent(fileUrl);
    const pathStartIndex = decodedUrl.indexOf('/o/') + 3;
    const pathEndIndex = decodedUrl.indexOf('?alt=media');

    if (pathStartIndex > 2 && pathEndIndex > -1) {
      const filePath = decodedUrl.substring(pathStartIndex, pathEndIndex);
      const storageRef = ref(storage, filePath);
      await deleteObject(storageRef);
      console.info(`[Storage] Successfully deleted: ${filePath}`);
    }
  } catch (error) {
    if (error.code === 'storage/object-not-found') {
      console.warn(`[Storage] File already gone or not found: ${fileUrl}`);
    } else {
      console.error('[Storage] Failed to delete file from storage:', error);
    }
  }
};
