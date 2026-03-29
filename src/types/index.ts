/**
 * Canonical Types definitions for Web matching Firestore schema constraints.
 */

export interface User {
  id?: string; // Appears as document ID; should not be redundantly stored via UID / userId
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'owner' | 'staff' | 'customer';
  phone?: string;
  height?: number;
  weight?: number;
  measurements?: {
    bust?: number;
    waist?: number;
    hips?: number;
  };
  fitPreference?: 'tight' | 'semi-tight' | 'standard' | 'semi-loose' | 'loose';
  createdAt: string | Date;
  updatedAt?: string | Date;
  lastLoginAt?: string | Date;
}

export interface Product {
  id?: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stockQuantity: number;
  sizes: string[];
  colors: string[];
  imageUrl: string;
  imageUrls?: string[];
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface Reservation {
  id?: string;
  customerId: string;
  customerName?: string;
  productId: string;
  date: string | Date;
  status: 'pending' | 'approved' | 'completed' | 'cancelled';
  size?: string;
  color?: string;
  staff?: string;
  notes?: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface Message {
  id?: string;
  conversationId: string;
  sender: string;
  text: string;
  createdAt: string | Date;
  readAt?: string | Date;
}

export interface Conversation {
  id?: string;
  customerId: string;
  customerName: string;
  lastMessage: string;
  lastMessageTime: string | Date;
  unread: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface WardrobeItem {
  id?: string;
  userId: string;
  productId?: string;
  imageUrl: string;
  category: string;
  addedAt: string | Date;
}

export interface Outfit {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  items: string[];
  createdAt: string | Date;
  updatedAt?: string | Date;
}

export interface Feedback {
  id?: string;
  userId: string;
  userName?: string;
  email: string;
  message: string;
  createdAt: string | Date;
}
