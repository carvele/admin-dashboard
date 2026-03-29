# Complete Database Schema Documentation

## Collections

### 1. Products
- **Description:** This collection contains information about the products available in the admin dashboard.
- **Fields:**
  - `productId` (string): Unique identifier for the product.
  - `name` (string): Name of the product.
  - `description` (string): Detailed information about the product.
  - `price` (number): Price of the product.
  - `category` (string): Category to which the product belongs.
  - `stock` (number): Quantity available in stock.
  - `createdAt` (timestamp): The date and time the product was added.
  - `updatedAt` (timestamp): The last date and time the product was updated.

- **Security Rules:**
  - Read access: Granted to authenticated users.
  - Write access: Restricted to admin users only.

- **Example:**
  ```json
  {
    "productId": "P123","name": "Sample Product","description": "This is a sample product.","price": 19.99,"category": "Clothing","stock": 100,"createdAt": "2026-03-29T07:30:12.000Z","updatedAt": "2026-03-29T07:30:12.000Z"
  }
  ```

### 2. WardrobeItems
- **Description:** This collection holds details about wardrobe items managed through the admin dashboard.
- **Fields:**
  - `wardrobeItemId` (string): Unique identifier for the wardrobe item.
  - `name` (string): Name of the wardrobe item.
  - `description` (string): Detailed information about the item.
  - `type` (string): Type of the wardrobe item (e.g., Shirt, Pants).
  - `size` (string): Size of the wardrobe item.
  - `color` (string): Color of the wardrobe item.
  - `price` (number): Price of the wardrobe item.
  - `imageUrl` (string): URL of the item's image.
  - `createdAt` (timestamp): The date and time the item was added to the wardrobe.
  - `updatedAt` (timestamp): The last date and time the item was updated.

- **Security Rules:**
  - Read access: Granted to authenticated users.
  - Write access: Restricted to admin users only.

- **Example:**
  ```json
  {
    "wardrobeItemId": "WI456","name": "Stylish Pants","description": "Comfortable stylish pants for casual wear.","type": "Pants","size": "M","color": "Black","price": 39.99,"imageUrl": "http://example.com/image.png","createdAt": "2026-03-29T07:30:12.000Z","updatedAt": "2026-03-29T07:30:12.000Z"
  }
  ```

### Additional Collections

*Please document the remaining 16 collections similarly with appropriate fields, security rules, and examples.*

---

Last updated on: 2026-03-29 07:30:12 UTC
