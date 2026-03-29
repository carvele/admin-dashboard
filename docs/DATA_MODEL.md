# Firestore Data Model

## Collections

### Users
- **Path**: `/users/{uid}`
- **Document ID**: Firebase Auth UID
- **Purpose**: User profiles and account information

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| firstName | string | Yes | User's first name (max 50 chars) |
| lastName | string | Yes | User's last name (max 50 chars) |
| email | string | Yes | User's email (unique) |
| phone | string | No | Phone number |
| role | string | Yes | `'admin'` \| `'owner'` \| `'staff'` \| `'customer'` |
| height | number | No | Height in cm |
| weight | number | No | Weight in kg |
| measurements | object | No | Bust, waist, hips (in cm) |
| fitPreference | string | No | Clothing fit preference |
| createdAt | Timestamp | Yes | Account creation time |
| updatedAt | Timestamp | No | Last update time |
| lastLoginAt | Timestamp | No | Track user activity |

### Products
- **Path**: `/products/{productId}`
- **Purpose**: Clothing product catalog

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Product name |
| description | string | Yes | Detailed description |
| category | string | Yes | Product category |
| price | number | Yes | Price in USD (>= 0) |
| stockQuantity | number | Yes | Available quantity |
| sizes | array | Yes | Available sizes (e.g., ["S", "M", "L"]) |
| colors | array | Yes | Available colors |
| imageUrl | string | Yes | Primary product image |
| imageUrls | array | No | Additional product images |
| createdAt | Timestamp | Yes | Created at |
| updatedAt | Timestamp | No | Updated at |

### Reservations
- **Path**: `/reservations/{reservationId}`
- **Purpose**: Booking reservations for products

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customerId | string | Yes | Reference to users.uid |
| customerName | string | No | Denormalized customer name |
| productId | string | Yes | Reference to products.id |
| date | Timestamp | Yes | Reservation date |
| status | string | Yes | `'pending'` \| `'approved'` \| `'completed'` \| `'cancelled'` |
| size | string | No | Selected size |
| color | string | No | Selected color |
| staff | string | No | Assigned staff member UID |
| notes | string | No | Internal notes |
| createdAt | Timestamp | Yes | Created at |
| updatedAt | Timestamp | No | Updated at |

### Messages
- **Path**: `/messages/{messageId}` or nested `/conversations/{convId}/messages/{msgId}`
- **Purpose**: User messages and chat

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| conversationId | string | Yes | Reference to conversation |
| sender | string | Yes | User UID who sent message |
| text | string | Yes | Message content |
| createdAt | Timestamp | Yes | Sent at |
| readAt | Timestamp | No | Read at |

### Conversations
- **Path**: `/conversations/{conversationId}`
- **Purpose**: Chat thread between users

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customerId | string | Yes | Reference to users.uid |
| customerName | string | Yes | Denormalized name |
| lastMessage | string | Yes | Last message text |
| lastMessageTime | Timestamp | Yes | When last message was sent |
| unread | number | Yes | Unread message count |
| createdAt | Timestamp | Yes | Created at |
| updatedAt | Timestamp | No | Updated at |

### WardrobeItems
- **Path**: `/wardrobeItems/{itemId}`
- **Purpose**: Virtual wardrobe collection item added by user

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string | Yes | User UID |
| productId | string | No | Ref to product if linked |
| imageUrl | string | Yes | Image of wardrobe item |
| category | string | Yes | Category classification |
| addedAt | Timestamp | Yes | Added timestamp |

### Outfits
- **Path**: `/outfits/{outfitId}`
- **Purpose**: Compilation of WardrobeItems

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string | Yes | User UID |
| name | string | Yes | Outfit Name |
| description | string | No | Description |
| items | array | Yes | Array of WardrobeItem IDs |
| createdAt | Timestamp | Yes | Created timestamp |
| updatedAt | Timestamp | No | Last update timestamp |

### Feedback
- **Path**: `/feedback/{feedbackId}`
- **Purpose**: User feedback submissions

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userId | string | Yes | Reference to users.uid |
| userName | string | No | Denormalized user name |
| email | string | Yes | User's email |
| message | string | Yes | Feedback text (10-2000 chars) |
| createdAt | Timestamp | Yes | Submitted at |

**Immutable**: No updates or deletes allowed

## Relationships

```
Users (1) ──→ (many) Reservations
Users (1) ──→ (many) Messages
Users (1) ──→ (many) Conversations
Users (1) ──→ (many) WardrobeItems
Users (1) ──→ (many) Outfits
Users (1) ──→ (many) Feedback

Products (1) ──→ (many) Reservations
Products (1) ──→ (many) WardrobeItems

Conversations (1) ──→ (many) Messages
```

## Indexes

See `firestore.indexes.json` for complete index configuration.

Key indexes:
- `reservations`: (customerId, date)
- `products`: (category, price)
- `conversations`: (unread, lastMessageTime)
- `messages`: (conversationId, createdAt)
