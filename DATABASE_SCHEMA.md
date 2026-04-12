# Database Schema Documentation

## Overview
This document outlines the Firestore database schema used by the application, focusing on how collections are related to ensure parity between the Android app and the Web Admin Dashboard. 
*Note*: This schema has been harmonized across both platforms to use exact matching fields.

## Collections

### `users`
Represents both customers and admin/staff users.

- `id`: `string` (Firebase UID)
- `email`: `string`
- `firstName`: `string`
- `lastName`: `string`
- `role`: `string` (`"customer"`, `"staff"`, `"admin"`, `"owner"`)
- `phone`: `string`
- `height`: `number` (optional)
- `weight`: `number` (optional)
- `measurements`: `map` (e.g. `{bust: number, waist: number, hips: number}`)
- `fitPreference`: `string` (optional)
- `deleted`: `boolean`
- `createdAt`: `timestamp` (Milliseconds Long)
- `updatedAt`: `timestamp` (Milliseconds Long)
- `lastLoginAt`: `timestamp` (Milliseconds Long)

### `products` (Catalog)
Available boutique items. (Previously referenced as `catalog`).

- `id`: `string` (Auto-generated)
- `name`: `string`
- `category`: `string`
- `subCategory`: `string`
- `price`: `number`
- `description`: `string`
- `material`: `string`
- `color`: `string`
- `baseColor`: `string`
- `careInstructions`: `string`
- `fitAndSizing`: `string`
- `styleCode`: `string`
- `season`: `string`
- `occasion`: `string`
- `visibility`: `string` (`"Draft"` or `"Published"`)
- `isFeatured`: `boolean`
- `images`: `array of string` (Image URLs)
- `imageUrl`: `string` (Primary Image URL)
- `sizes`: `array of string`
- `stock`: `number`
- `tags`: `array of string`
- `isAlterable`: `boolean`
- `timestamp`: `number` (Epoch ms)
- `model3DURL`: `string` (AR GLB model)
- `maskURL`: `string` (AR DeepAR or segmentation mask)
- `rating`: `number`
- `reviewCount`: `number`
- `onSale`: `boolean`
- `salePrice`: `number`
- `discountPercentage`: `number`
- `isNewArrival`: `boolean`
- `measurements`: `map` (Nested map of sizes and measurements)
- `createdAt`: `timestamp` (Milliseconds Long)
- `updatedAt`: `timestamp` (Milliseconds Long)
- `deleted`: `boolean`

### `reservations`
Customer's shopping carts or orders.

- `id`: `string` (Auto-generated)
- `customerId`: `string` (References `users.id`)
- `customerName`: `string`
- `productId`: `string` (References `products.id`)
- `productName`: `string`
- `imageUrl`: `string`
- `date`: `timestamp` (Milliseconds Long)
- `returnDate`: `timestamp` (Milliseconds Long)
- `status`: `string` (`"pending"`, `"approved"`, `"completed"`, `"cancelled"`)
- `size`: `string`
- `color`: `string`
- `quantity`: `number`
- `appointmentTime`: `string`
- `staffId`: `string`
- `rentalPrice`: `number`
- `paymentStatus`: `string`
- `paymentType`: `string`
- `receiptUrl`: `string`
- `timestamp`: `number` (Epoch ms)

### `wardrobe`
Items owned by users.

- `id`: `string` (Auto-generated)
- `userId`: `string` (References `users.id`)
- `productId`: `string` (Optional, references `products.id`)
- `imageUrl`: `string`
- `category`: `string`
- `subCategory`: `string`
- `timestamp`: `number` (Epoch ms)
- `deleted`: `boolean`

### `inventory`
Manages per-size inventory tracking.

- `id`: `string` (Auto-generated)
- `productDocId`: `string`
- `sku`: `string`
- `item`: `string` (Product Name)
- `category`: `string`
- `size`: `string`
- `total`: `number`
- `reserved`: `number`
- `available`: `number`

### `notifications`
User alerts and updates.

- `id`: `string`
- `title`: `string`
- `message`: `string`
- `imageUrl`: `string`
- `timestamp`: `number` (Epoch ms)
- `type`: `string`
- `isRead`: `boolean`
- `relatedId`: `string`
- `userId`: `string`

### `reviews` (ProductReview)
Customer product reviews.

- `id`: `string`
- `productId`: `string`
- `userId`: `string`
- `userName`: `string`
- `rating`: `number`
- `reviewText`: `string`
- `timestamp`: `number` (Epoch ms)
- `reservationId`: `string`

### `suggestedOutfits`
Stylist recommendations or pre-made looks.

- `id`: `string`
- `name`: `string`
- `price`: `number`
- `imageUrl`: `string`
- `isAvailable`: `boolean`
- `isFavorite`: `boolean`
- `description`: `string`
- `sizes`: `array of string`
- `style`: `string`

### `exploreCategories`
Explorative style groupings.

- `id`: `string`
- `name`: `string`
- `productCount`: `number`
- `imageUrl`: `string`

### `favorites` (FavoriteProduct)
User liked products.

- `id`: `string`
- `name`: `string`
- `category`: `string`
- `imageUrl`: `string`
- `isAvailable`: `boolean`

## Conventions

- **Timestamps:** Harmonized to use Epoch milliseconds as Numbers (`Date.now()` on JS, `long` on Java). This prevents cross-platform deserialization errors.
- **Naming:** `camelCase` for all fields (`firstName`, `lastName`).
- **IDs:** Document IDs must be added to the data payload as `id` or `customId` to make it accessible to Android clients.
