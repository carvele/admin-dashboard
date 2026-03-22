import { storage } from './config';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Uploads a file to Firebase Storage and returns the public download URL.
 * 
 * @param {File} file - The file object from an input element.
 * @param {string} folderPath - The storage folder (e.g., 'catalog-assets')
 * @returns {Promise<string>} The public download URL for the file
 */
export const uploadFile = async (file, folderPath = 'catalog-assets') => {
  if (!file) throw new Error("No file provided");
  
  // Create a unique filename to prevent overwrites
  const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const storageRef = ref(storage, `${folderPath}/${uniqueName}`);
  
  // We use uploadBytesResumable in case we want to show progress bars later
  const uploadTask = await uploadBytesResumable(storageRef, file);
  const downloadURL = await getDownloadURL(uploadTask.ref);
  
  return downloadURL;
};

/**
 * Uploads a file to Cloudinary and returns the { secure_url, public_id } object.
 * 
 * @param {File} file - The file object from an input element.
 * @returns {Promise<Object>} An object containing secure_url and public_id
 */
export const uploadToCloudinary = async (file, retries = 2) => {
  if (!file) throw new Error("No file provided");
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'boutique_productDetails'); // Matches Android app

      const response = await fetch('https://api.cloudinary.com/v1_1/dlrlgp4bq/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Cloudinary upload failed");
      }
      
      const data = await response.json();
      return {
        secure_url: data.secure_url,
        public_id: data.public_id
      };
    } catch (error) {
      if (attempt === retries) {
        console.error("Cloudinary upload error after retries:", error);
        throw error;
      }
      console.warn(`Upload attempt ${attempt + 1} failed. Retrying...`, error);
      await new Promise(res => setTimeout(res, 1000 * (attempt + 1))); // Incremental backoff
    }
  }
};

/**
 * Deletes a file from Firebase Storage given its full public URL.
 * 
 * @param {string} fileUrl - The public download URL of the file to delete
 */
export const deleteFile = async (fileUrl) => {
  if (!fileUrl || !fileUrl.startsWith('http')) return;
  
  try {
    // 1. Extract the file path from the complex Firebase Storage URL
    // e.g. https://firebasestorage.googleapis.com/v0/b/project.appspot.com/o/catalog-assets%2F123_img.png?alt=media...
    const decodedUrl = decodeURIComponent(fileUrl);
    const pathStartIndex = decodedUrl.indexOf('/o/') + 3;
    const pathEndIndex = decodedUrl.indexOf('?alt=media');
    
    if (pathStartIndex > 2 && pathEndIndex > -1) {
      const filePath = decodedUrl.substring(pathStartIndex, pathEndIndex);
      const storageRef = ref(storage, filePath);
      await deleteObject(storageRef);
    }
  } catch (error) {
    console.error("Failed to delete file from storage:", error);
    // We don't throw here to prevent blocking the Firestore document deletion if the file is already gone
  }
};
