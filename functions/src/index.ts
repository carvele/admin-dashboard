import * as admin from 'firebase-admin';

admin.initializeApp();

export * as migrations from './migrations';
export * as scheduled from './scheduled/cleanupOldData';
export * as validators from './validators/validateWrites';
