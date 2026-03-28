# Database Schema Documentation

## Overview
This document outlines the Firestore database schema used by the application, focusing on how collections are related to ensure parity between the Android app and the Web Admin Dashboard.

## Collections

### `users`
Represents both customers and admin/staff users.

- `id`: `string` (Firebase UID)
- `email`: `string`
- `firstName`: `string` (Preferred camelCase, falls back to `first_name`)
- `lastName`: `string` (Preferred camelCase, falls back to `last_name`)
- `role`: `string` (`"customer"`, `"staff"`, `"admin"`, `"owner"`)
- `phone`: `string`
- `createdAt`: `timestamp`
- `updatedAt`: `timestamp`
- `lastOnline`: `timestamp`
- **Sub-collections:** None (Currently favorites/feedback are separate collections and not nested)

### `catalog` (Products)
Available boutique items.

- `id`: `string` (Auto-generated)
- `name`: `string`
- `description`: `string`
- `price`: `number`
- `category`: `string`
- `imageUrl`: `string`
- `stock`: `number` (or map of sizes)
- `createdAt`: `timestamp`
- `updatedAt`: `timestamp`

### `reservations`
Customer's shopping carts or orders.

- `id`: `string` (Auto-generated)
- `userId`: `string` (References `users.id`)
- `customerName`: `string`
- `customerEmail`: `string`
- `status`: `string` (`"pending"`, `"approved"`, `"completed"`, `"cancelled"`)
- `totalAmount`: `number`
- `reservationDate`: `timestamp`
- `createdAt`: `timestamp`
- `updatedAt`: `timestamp`
- **Sub-collections:**
  - `items`: The products reserved in this order.
    - `id`: `string`
    - `productId`: `string` (References `catalog.id`)
    - `name`: `string`
    - `price`: `number`
    - `quantity`: `number`
    - `size`: `string`

### `wardrobe`
Items owned by users.

- `id`: `string` (Auto-generated)
- `userId`: `string` (References `users.id`)
- `productId`: `string` (Optional, links back to `catalog.id` if bought from boutique)
- `imageUrl`: `string`
- `category`: `string`
- `dateAdded`: `timestamp`

### `favorites`
Items favorited by users.

- `id`: `string` (Composite ID: `userId_productId`)
- `userId`: `string` (References `users.id`)
- `productId`: `string` (References `catalog.id`)
- `addedAt`: `timestamp`

### `feedback`
Feedback on products.

- `id`: `string` (Auto-generated)
- `userId`: `string` (References `users.id`)
- `userName`: `string`
- `productId`: `string` (References `catalog.id`)
- `rating`: `number`
- `comment`: `string`
- `createdAt`: `timestamp`

### `logs`
Audit logs for staff actions.

- `id`: `string` (Auto-generated)
- `userId`: `string` (References `users.id`)
- `userName`: `string`
- `action`: `string`
- `timestamp`: `timestamp`
- `details`: `map` (Contextual data)

## Conventions

- **Timestamps:** Use Firebase `serverTimestamp()` for writes. Dates are stored as `{ seconds, nanoseconds }`.
- **Naming:** Prefer `camelCase` for all fields (`firstName`, `lastName`). Legacy seed data may use `snake_case` in Android, which the dashboard fallbacks handle (`getUserDisplayName`).
- **IDs:** Document IDs must be added to the data payload as `id` or `customId` to make it accessible to Android clients effectively.
