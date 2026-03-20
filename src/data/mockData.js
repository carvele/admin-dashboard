export const reservationTrends = [
  { name: 'Mon', reservations: 12 },
  { name: 'Tue', reservations: 19 },
  { name: 'Wed', reservations: 15 },
  { name: 'Thu', reservations: 22 },
  { name: 'Fri', reservations: 35 },
  { name: 'Sat', reservations: 48 },
  { name: 'Sun', reservations: 42 },
];

export const popularOutfits = [
  { name: 'Summer Breeze Set', value: 400 },
  { name: 'Midnight Gala Gown', value: 300 },
  { name: 'Classic Silk Blouse', value: 300 },
  { name: 'Velvet Blazer', value: 200 },
];

export const mockReservations = [
  { id: 'RES-001', customer: 'Emma Watson', outfit: 'Summer Breeze Set', date: '2026-03-14T10:00:00', status: 'Pending', staff: 'Unassigned', countdown: true, size: 'M' },
  { id: 'RES-002', customer: 'Sophia Chen', outfit: 'Midnight Gala Gown', date: '2026-03-15T14:30:00', status: 'Approved', staff: 'Sarah Jennings', countdown: false, size: 'S' },
  { id: 'RES-003', customer: 'Olivia Smith', outfit: 'Classic Silk Blouse', date: '2026-03-12T09:00:00', status: 'Completed', staff: 'Chloe Staff', countdown: false, size: 'L' },
  { id: 'RES-004', customer: 'Mia Johnson', outfit: 'Velvet Blazer', date: '2026-03-16T16:00:00', status: 'Pending', staff: 'Unassigned', countdown: true, size: 'M' },
  { id: 'RES-005', customer: 'Isabella Taylor', outfit: 'Summer Breeze Set', date: '2026-03-10T11:00:00', status: 'Cancelled', staff: 'Sarah Jennings', countdown: false, size: 'S' },
];

export const mockCustomers = [
  { id: 'CUST-001', name: 'Emma Watson', email: 'emma.w@example.com', phone: '+1 234 567 8900', reservations: 4, lastActive: '2 hours ago', status: 'Active', measurements: { bust: 34, waist: 26, hips: 36, height: 165 }, wardrobeItems: 12, joinedAt: '2025-09-15T10:30:00Z', lastOnline: Date.now() - 2 * 60 * 60 * 1000, totalSpent: 37400, preferredSizes: ['S', 'M'], engagementScore: 82 },
  { id: 'CUST-002', name: 'Sophia Chen', email: 'sophia.c@example.com', phone: '+1 234 567 8901', reservations: 1, lastActive: '1 day ago', status: 'Active', measurements: { bust: 32, waist: 24, hips: 34, height: 160 }, wardrobeItems: 5, joinedAt: '2025-11-02T14:00:00Z', lastOnline: Date.now() - 24 * 60 * 60 * 1000, totalSpent: 12500, preferredSizes: ['S'], engagementScore: 45 },
  { id: 'CUST-003', name: 'Olivia Smith', email: 'olivia.s@example.com', phone: '+1 234 567 8902', reservations: 8, lastActive: '5 mins ago', status: 'VIP', measurements: { bust: 36, waist: 28, hips: 38, height: 170 }, wardrobeItems: 24, joinedAt: '2025-06-20T09:00:00Z', lastOnline: Date.now() - 5 * 60 * 1000, totalSpent: 89600, preferredSizes: ['M', 'L'], engagementScore: 96 },
  { id: 'CUST-004', name: 'Mia Johnson', email: 'mia.j@example.com', phone: '+1 234 567 8903', reservations: 0, lastActive: '1 week ago', status: 'Inactive', measurements: { bust: null, waist: null, hips: null, height: null }, wardrobeItems: 0, joinedAt: '2026-02-10T16:00:00Z', lastOnline: Date.now() - 7 * 24 * 60 * 60 * 1000, totalSpent: 0, preferredSizes: [], engagementScore: 8 },
];

export const mockConversations = [
  { id: 'MSG-001', customerId: 'CUST-001', customerName: 'Emma Watson', unread: 2, lastMessage: 'Is the Summer Breeze Set still available for tomorrow?', time: '10:45 AM', active: true },
  { id: 'MSG-002', customerId: 'CUST-002', customerName: 'Sophia Chen', unread: 0, lastMessage: 'Thank you for the outfit suggestions!', time: 'Yesterday', active: false },
  { id: 'MSG-003', customerId: 'CUST-003', customerName: 'Olivia Smith', unread: 1, lastMessage: 'Could you recommend something for a cocktail party?', time: 'Tue', active: false },
];

export const mockMessages = [
  { id: 1, sender: 'customer', text: 'Hi, I have a reservation tomorrow. Can I try the Midnight Gala Gown instead?', time: '10:30 AM' },
  { id: 2, sender: 'staff', text: 'Hello Emma! Yes, we have that in size M. I will update your reservation.', time: '10:35 AM' },
  { id: 3, sender: 'customer', text: 'Is the Summer Breeze Set still available for tomorrow? I might want to try both.', time: '10:45 AM' },
];

export const mockCatalog = [
  { id: 'ITM-001', name: 'Midnight Gala Gown', category: 'Dresses', sizes: ['S', 'M', 'L'], price: 12500, stock: 4, tags: ['Featured', 'AR Try-On'], image: '👗' },
  { id: 'ITM-002', name: 'Classic Silk Blouse', category: 'Tops', sizes: ['XS', 'S', 'M', 'L'], price: 4500, stock: 12, tags: ['New Arrival'], image: '👚' },
  { id: 'ITM-003', name: 'Summer Breeze Skirt', category: 'Bottoms', sizes: ['S', 'M'], price: 3200, stock: 3, tags: ['AR Try-On'], image: '👗' },
  { id: 'ITM-004', name: 'Velvet Blazer', category: 'Outerwear', sizes: ['M', 'L', 'XL'], price: 8900, stock: 6, tags: [], image: '🧥' },
  { id: 'ITM-005', name: 'Evening Clutch', category: 'Accessories', sizes: ['OS'], price: 2100, stock: 15, tags: ['New Arrival'], image: '👜' },
];

// Normalized: each wardrobe item is its own document with userId reference
export const mockWardrobeItems = [
  { id: 'WI-001', userId: 'CUST-001', productId: 'ITM-001', imageUrl: '👗', category: 'Dresses', timestamp: Date.now() - 86400000 },
  { id: 'WI-002', userId: 'CUST-001', productId: 'ITM-002', imageUrl: '👚', category: 'Tops', timestamp: Date.now() - 72000000 },
  { id: 'WI-003', userId: 'CUST-001', productId: 'ITM-005', imageUrl: '👜', category: 'Bags', timestamp: Date.now() - 50000000 },
  { id: 'WI-004', userId: 'CUST-002', productId: 'ITM-002', imageUrl: '👚', category: 'Tops', timestamp: Date.now() - 40000000 },
  { id: 'WI-005', userId: 'CUST-002', productId: 'ITM-004', imageUrl: '🧥', category: 'Outerwear', timestamp: Date.now() - 30000000 },
];

// Normalized: each outfit is its own document with userId reference
export const mockOutfits = [
  { id: 'OUT-001', userId: 'CUST-001', name: 'Evening Look', items: [{ imageUrl: '👗', x: 0, y: 0, scale: 1 }, { imageUrl: '👜', x: 100, y: 100, scale: 1 }], timestamp: Date.now() - 20000000 },
  { id: 'OUT-002', userId: 'CUST-002', name: 'Casual Friday', items: [{ imageUrl: '👚', x: 0, y: 0, scale: 1 }, { imageUrl: '🧥', x: 100, y: 100, scale: 1 }], timestamp: Date.now() - 10000000 },
];

export const mockInventory = [
  { id: 'INV-001', item: 'Midnight Gala Gown', category: 'Dresses', size: 'M', total: 10, reserved: 8, available: 2 },
  { id: 'INV-002', item: 'Midnight Gala Gown', category: 'Dresses', size: 'S', total: 5, reserved: 2, available: 3 },
  { id: 'INV-003', item: 'Classic Silk Blouse', category: 'Tops', size: 'M', total: 20, reserved: 5, available: 15 },
  { id: 'INV-004', item: 'Summer Breeze Skirt', category: 'Bottoms', size: 'L', total: 8, reserved: 8, available: 0 },
  { id: 'INV-005', item: 'Velvet Blazer', category: 'Outerwear', size: 'XL', total: 12, reserved: 2, available: 10 },
];

export const analyticsConvRate = [
  { month: 'Oct', tryOn: 400, reserved: 240 },
  { month: 'Nov', tryOn: 300, reserved: 139 },
  { month: 'Dec', tryOn: 500, reserved: 380 },
  { month: 'Jan', tryOn: 278, reserved: 190 },
  { month: 'Feb', tryOn: 189, reserved: 48 },
  { month: 'Mar', tryOn: 239, reserved: 180 },
];
