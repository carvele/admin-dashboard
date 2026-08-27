/**
 * Canonical Types definitions for Web matching Firestore schema constraints.
 */

export interface User {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'owner' | 'staff' | 'customer';
  phone?: string;
  height?: number;
  weight?: number;
  measurements?: Record<string, number>;
  fitPreference?: 'tight' | 'semi-tight' | 'standard' | 'semi-loose' | 'loose';
  deleted?: boolean;
  createdAt: string | Date | number | Record<string, number>;
  updatedAt?: string | Date | number | Record<string, number>;
  lastLoginAt?: string | Date | number | Record<string, number>;
}

export interface Product {
  id?: string;
  name: string;
  category: string;
  subCategory?: string;
  price: number;
  description: string;
  material?: string;
  color?: string;
  baseColor?: string;
  careInstructions?: string;
  fitAndSizing?: string;
  styleCode?: string;
  season?: string;
  occasion?: string;
  visibility: string;
  isFeatured?: boolean;
  created_by?: string;
  images: string[];
  imageUrl: string;
  sizes: string[];
  stock: number;
  tags?: string[];
  isAlterable?: boolean;
  timestamp?: number;
  model_3dUrl?: string;
  maskUrl?: string;
  rating?: number;
  reviewCount?: number;
  onSale?: boolean;
  salePrice?: number;
  discountPercentage?: number;
  isNewArrival?: boolean;
  measurements?: Record<string, Record<string, string>>;
  createdAt?: string | Date | number | Record<string, number>;
  updatedAt?: string | Date | number | Record<string, number>;
  updated_by?: string;
  status?: string;
  deleted?: boolean;
}

export interface Reservation {
  id?: string;
  customerName?: string;
  customerId?: string;
  productId?: string;
  productName?: string;
  name?: string;
  title?: string;
  imageUrl?: string;
  date?: string | Date | number | Record<string, number>;
  returnDate?: string | Date | number | Record<string, number>;
  status: string;
  size?: string;
  color?: string;
  quantity?: number;
  appointmentTime?: string;
  staffId?: string;
  countdown?: boolean;
  timestamp?: number;
  rentalPrice?: number;
  hiddenInCancelled?: boolean;
  hiddenInHistory?: boolean;
  deleted?: boolean;
  paymentStatus?: string;
  paymentType?: string;
  receiptUrl?: string;
  createdAt?: string | Date | number | Record<string, number>;
  completedAt?: string | Date | number | Record<string, number>;
}

export interface Message {
  id?: string;
  conversationId: string;
  sender: string;
  text: string;
  createdAt: string | Date | number | Record<string, number>;
  readAt?: string | Date | number | Record<string, number>;
}

export interface Conversation {
  id?: string;
  customerId: string;
  customerName: string;
  lastMessage: string;
  lastMessageTime: string | Date | number | Record<string, number>;
  unread: number;
  createdAt: string | Date | number | Record<string, number>;
  updatedAt?: string | Date | number | Record<string, number>;
}

export interface WardrobeItem {
  id?: string;
  userId: string;
  imageUrl: string;
  category: string;
  subCategory?: string;
  productId?: string;
  timestamp?: number;
  addedAt?: string | Date | number | Record<string, number>;
  deleted?: boolean;
}

export interface Outfit {
  id?: string;
  userId: string;
  name: string;
  description?: string;
  items: string[];
  createdAt: string | Date | number | Record<string, number>;
  updatedAt?: string | Date | number | Record<string, number>;
}

export interface Feedback {
  id?: string;
  userId: string;
  userName?: string;
  email: string;
  message: string;
  createdAt: string | Date | number | Record<string, number>;
}

export interface Notification {
  id?: string;
  title: string;
  message: string;
  imageUrl?: string;
  timestamp: number;
  type?: string;
  isRead?: boolean;
  relatedId?: string;
  userId?: string;
}

export interface ProductReview {
  id?: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  reviewText: string;
  timestamp: number;
  reservationId?: string;
}

export interface BodyProfile {
  neck?: number;
  neckBase?: number;
  shoulderWidth?: number;
  backLength?: number;
  armLength?: number;
  sleeveLengthCenterBack?: number;
  topBust?: number;
  underBust?: number;
  waist?: number;
  hip?: number;
  insideLegLength?: number;
  user_height_cm?: number;
  user_weight_kg?: number;
  fitPreference?: string;
}

export interface PoseData {
  neck?: number[];
  neckBase?: number[];
  shoulderWidth?: number[];
  backLength?: number[];
  armLength?: number[];
  sleeveLengthCenterBack?: number[];
  topBust?: number[];
  underBust?: number[];
  waist?: number[];
  hip?: number[];
  insideLegLength?: number[];
  user_height_cm?: number[];
  user_weight_kg?: number[];
}

export interface ExploreCategory {
  id?: string;
  name: string;
  productCount: number;
  imageUrl?: string;
}

export interface SuggestedOutfit {
  id?: string;
  name: string;
  price: number;
  imageUrl?: string;
  isAvailable?: boolean;
  isFavorite?: boolean;
  description?: string;
  sizes?: string[];
  style?: string;
}

export interface FavoriteProduct {
  id?: string;
  name: string;
  category: string;
  imageUrl?: string;
  isAvailable?: boolean;
}
