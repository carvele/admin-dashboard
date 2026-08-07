import * as admin from "firebase-admin";
import {firestore} from "firebase-functions/v2";
import * as logger from "firebase-functions/logger";

/**
 * Triggers when a staff document is updated.
 * Automatically disables or enables the corresponding Firebase Auth user 
 * based on the staff document's isActive flag.
 */
export const onStaffUpdated = firestore.onDocumentUpdated("staff/{docId}", async (event) => {
  const data = event.data;
  if (!data) return null;

  const before = data.before.data();
  const after = data.after.data();

  if (!before || !after) return null;

  // Only trigger auth changes if isActive actually changed
  if (before.isActive === after.isActive) {
    return null;
  }

  const authUid = after.authUid;
  if (!authUid) {
    logger.warn(`Staff document ${event.params.docId} missing authUid. Cannot update Auth status.`);
    return null;
  }

  try {
    // Disable user if isActive is false, enable if true
    await admin.auth().updateUser(authUid, {
      disabled: !after.isActive,
    });
    
    logger.info(`Successfully updated Auth status for staff ${authUid}. Disabled: ${!after.isActive}`);
    return null;
  } catch (error) {
    logger.error(`Error updating Auth status for staff ${authUid}:`, error);
    return null;
  }
});
