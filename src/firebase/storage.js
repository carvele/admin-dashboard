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
