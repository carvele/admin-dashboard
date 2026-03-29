import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

export const validateProductWrite = functions.firestore
  .document('products/{productId}')
  .onWrite(async (change, context) => {
    const productId = context.params.productId;
    const newData = change.after.data();

    // Deleted
    if (!newData) return null;

    const errors: string[] = [];

    // Validate name
    if (typeof newData.name !== 'string' || newData.name.length < 3) {
      errors.push('Product name must be a string with at least 3 characters');
    }

    // Validate price
    if (typeof newData.price !== 'number' || newData.price < 0) {
      errors.push('Product price must be a non-negative number');
    }

    // Validate stock
    if (typeof newData.stockQuantity !== 'number' || newData.stockQuantity < 0) {
      errors.push('Stock quantity must be a non-negative number');
    }

    // Validate arrays
    if (!Array.isArray(newData.sizes) || newData.sizes.length === 0) {
      errors.push('Product must have at least one size');
    }

    if (!Array.isArray(newData.colors) || newData.colors.length === 0) {
      errors.push('Product must have at least one color');
    }

    // If errors, rollback (we cannot reject onWrite natively without rules, but we can throw)
    if (errors.length > 0) {
      console.error(`Invalid product ${productId}:`, errors);
      throw new functions.https.HttpsError('invalid-argument', errors.join(', '));
    }

    // Timestamps
    if (!change.before.exists) {
      await db.collection('products').doc(productId).update({
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      // Prevent infinite loops on update by checking if only timestamps changed
      const beforeData = change.before.data();
      if (
        beforeData && 
        newData.updatedAt && 
        (!newData.createdAt || beforeData.createdAt?.isEqual(newData.createdAt)) &&
        JSON.stringify({...beforeData, updatedAt: null, createdAt: null}) === JSON.stringify({...newData, updatedAt: null, createdAt: null})
      ) {
         return null; 
      }
      
      await db.collection('products').doc(productId).update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return null;
  });

export const validateReservationWrite = functions.firestore
  .document('reservations/{reservationId}')
  .onWrite(async (change, context) => {
    const reservationId = context.params.reservationId;
    const newData = change.after.data();

    if (!newData) return null;

    const errors: string[] = [];

    const validStatuses = ['pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(newData.status)) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    if (
      !(newData.date instanceof admin.firestore.Timestamp) &&
      typeof newData.date !== 'string'
    ) {
      errors.push('Date must be a valid timestamp or ISO string');
    }

    if (!newData.customerId) {
        errors.push('customerId is required');
    } else {
        const customer = await db.collection('users').doc(newData.customerId).get();
        if (!customer.exists) {
            errors.push('Referenced customer does not exist');
        }
    }

    if (!newData.productId) {
        errors.push('productId is required');
    } else {
        const product = await db.collection('products').doc(newData.productId).get();
        if (!product.exists) {
            errors.push('Referenced product does not exist');
        }
    }

    if (errors.length > 0) {
      console.error(`Invalid reservation ${reservationId}:`, errors);
      throw new functions.https.HttpsError('invalid-argument', errors.join(', '));
    }

    return null;
  });
