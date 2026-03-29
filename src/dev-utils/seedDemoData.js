/**
 * Demo Data Seeder for JezSy Collection Admin
 *
 * Seeds Firestore with realistic 90-day operational data.
 * Designed to run ONCE from Settings → Developer Tools.
 */
import { addDocument } from '../firebase/firestore';

// --- Helpers ---
const randomDate = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  d.setHours(Math.floor(Math.random() * 12) + 8); // 8am-8pm
  return d.toISOString();
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// --- Data Templates ---
const CUSTOMERS = [
  {
    name: 'Maria Santos',
    email: 'maria.santos@email.com',
    status: 'Active',
    phone: '+63 917 123 4567',
    totalSpent: 45000,
    wardrobeItems: 3,
    reservations: 5,
  },
  {
    name: 'Anna Cruz',
    email: 'anna.cruz@email.com',
    status: 'VIP',
    phone: '+63 918 234 5678',
    totalSpent: 120000,
    wardrobeItems: 8,
    reservations: 12,
  },
  {
    name: 'Bea Reyes',
    email: 'bea.reyes@email.com',
    status: 'Active',
    phone: '+63 919 345 6789',
    totalSpent: 32000,
    wardrobeItems: 2,
    reservations: 4,
  },
  {
    name: 'Carlos Tan',
    email: 'carlos.tan@email.com',
    status: 'Inactive',
    phone: '+63 920 456 7890',
    totalSpent: 8000,
    wardrobeItems: 1,
    reservations: 1,
  },
  {
    name: 'Diana Lim',
    email: 'diana.lim@email.com',
    status: 'Active',
    phone: '+63 921 567 8901',
    totalSpent: 67000,
    wardrobeItems: 5,
    reservations: 7,
  },
];

const PRODUCTS = [
  {
    name: 'Midnight Elegance Gown',
    category: 'Dresses',
    price: 15000,
    material: 'Silk',
    color: 'Black',
    fitAndSizing: 'Slim Fit',
    season: 'All-Season',
    occasion: 'Formal',
    sizes: ['S', 'M', 'L'],
    visibility: 'Published',
    featured: true,
  },
  {
    name: 'Summer Breeze Set',
    category: 'Tops',
    price: 4500,
    material: 'Linen',
    color: 'White',
    fitAndSizing: 'Regular Fit',
    season: 'Summer',
    occasion: 'Casual',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    visibility: 'Published',
    featured: false,
  },
  {
    name: 'Royal Wedding Gown',
    category: 'Dresses',
    price: 35000,
    material: 'Tulle & Lace',
    color: 'Ivory',
    fitAndSizing: 'True to Size',
    season: 'All-Season',
    occasion: 'Wedding',
    sizes: ['S', 'M', 'L'],
    visibility: 'Published',
    featured: true,
  },
  {
    name: 'Business Elite Blazer',
    category: 'Outerwear',
    price: 8500,
    material: 'Wool Blend',
    color: 'Navy',
    fitAndSizing: 'Regular Fit',
    season: 'Autumn',
    occasion: 'Business',
    sizes: ['S', 'M', 'L', 'XL'],
    visibility: 'Published',
    featured: false,
  },
  {
    name: 'Party Night Sequin Top',
    category: 'Tops',
    price: 6200,
    material: 'Sequin Mesh',
    color: 'Gold',
    fitAndSizing: 'Slim Fit',
    season: 'All-Season',
    occasion: 'Party',
    sizes: ['XS', 'S', 'M'],
    visibility: 'Published',
    featured: true,
  },
  {
    name: 'Resort Maxi Dress',
    category: 'Dresses',
    price: 9800,
    material: 'Chiffon',
    color: 'Coral',
    fitAndSizing: 'Oversized',
    season: 'Summer',
    occasion: 'Resort',
    sizes: ['S', 'M', 'L', 'XL'],
    visibility: 'Published',
    featured: false,
  },
  {
    name: 'Classic Tailored Pants',
    category: 'Bottoms',
    price: 5500,
    material: 'Cotton Twill',
    color: 'Charcoal',
    fitAndSizing: 'Regular Fit',
    season: 'All-Season',
    occasion: 'Business',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    visibility: 'Published',
    featured: false,
  },
  {
    name: 'Cocktail Mini Dress',
    category: 'Dresses',
    price: 11000,
    material: 'Satin',
    color: 'Burgundy',
    fitAndSizing: 'Slim Fit',
    season: 'Winter',
    occasion: 'Party',
    sizes: ['XS', 'S', 'M', 'L'],
    visibility: 'Draft',
    featured: false,
  },
];

const STATUSES = ['Pending', 'Confirmed', 'Fitting', 'Completed', 'Cancelled'];

export const seedDemoData = async (onProgress) => {
  if (import.meta.env.PROD) {
    throw new Error(
      'Mock data seeding is disabled in production environments for security reasons.',
    );
  }
  let step = 0;
  const totalSteps = CUSTOMERS.length + PRODUCTS.length + PRODUCTS.length * 2 + 20 + 5 + 15;

  const progress = (msg) => {
    step++;
    onProgress?.({ step, totalSteps, message: msg });
  };

  // 1. Seed Customers
  const customerIds = [];
  for (const cust of CUSTOMERS) {
    progress(`Creating customer: ${cust.name}`);
    const id = await addDocument('users', {
      ...cust,
      role: 'customer',
      lastOnline: randomDate(7),
      createdAt: new Date(randomDate(90)),
      measurements: {
        bust: `${Math.floor(Math.random() * 10) + 32}"`,
        waist: `${Math.floor(Math.random() * 8) + 26}"`,
        hips: `${Math.floor(Math.random() * 10) + 34}"`,
      },
    });
    customerIds.push({ id, name: cust.name });
  }

  // 2. Seed Products
  const productIds = [];
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const acronym = p.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .substring(0, 3)
      .toUpperCase();
    const sku = `${acronym}-${String(i + 1).padStart(3, '0')}`;
    progress(`Creating product: ${p.name}`);
    const docId = await addDocument('products', {
      ...p,
      id: sku,
      stock: Math.floor(Math.random() * 15) + 3,
      tags: p.featured ? ['Featured', 'New Arrival'] : ['New Arrival'],
      imageUrl: '👗',
      images: [],
      description: `Premium ${p.material} ${p.category.toLowerCase()} for ${p.occasion.toLowerCase()} occasions.`,
      careInstructions: 'Dry clean recommended',
      styleCode: sku,
      created_by: 'admin@jezsy.com',
      timestamp: Date.now() - Math.floor(Math.random() * 86400000 * 60), // random within 60 days
    });
    productIds.push({ id: docId, name: p.name, sku, sizes: p.sizes, price: p.price });
  }

  // 3. Seed Inventory (per product per size)
  for (const prod of productIds) {
    for (const size of PRODUCTS.find((p) => p.name === prod.name)?.sizes || ['M']) {
      const total = Math.floor(Math.random() * 10) + 2;
      const reserved = Math.min(Math.floor(Math.random() * 3), total);
      progress(`Creating inventory: ${prod.name} / ${size}`);
      await addDocument('inventory', {
        productDocId: prod.id,
        sku: prod.sku,
        item: prod.name,
        category: PRODUCTS.find((p) => p.name === prod.name)?.category || 'General',
        size,
        total,
        reserved,
        available: total - reserved,
      });
    }
  }

  // 4. Seed Reservations (20 entries spanning 90 days)
  const staffNames = ['Admin', 'Staff Member'];
  for (let i = 0; i < 20; i++) {
    const cust = pick(customerIds);
    const prod = pick(productIds);
    const status = pick(STATUSES);
    const daysAgo = Math.floor(Math.random() * 90);
    progress(`Creating reservation ${i + 1}/20`);
    await addDocument('reservations', {
      id: `RES-${String(i + 1).padStart(3, '0')}`,
      customer: cust.name,
      customer_id: cust.id,
      outfit: prod.name,
      size: pick(PRODUCTS.find((p) => p.name === prod.name)?.sizes || ['M']),
      date: randomDate(daysAgo),
      status,
      staff: status === 'Pending' ? 'Unassigned' : pick(staffNames),
      assigned_staff_id: status === 'Pending' ? '' : 'seeded',
      countdown: status === 'Pending',
      deposit: Math.random() > 0.4,
    });
  }

  // 5. Seed Conversations (5 threads tied to customers)
  const convIds = [];
  for (let i = 0; i < 5; i++) {
    const cust = customerIds[i % customerIds.length];
    progress(`Creating conversation with ${cust.name}`);
    const convId = `conv_seed_${i + 1}`;
    await addDocument('conversations', {
      id: convId,
      customerName: cust.name,
      customerId: cust.id,
      lastMessage: pick([
        'Thank you for the update!',
        'When will my fitting be scheduled?',
        'I love the new collection!',
        'Can I reschedule my appointment?',
        'Is the gown available in size S?',
      ]),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      unread: Math.floor(Math.random() * 3),
    });
    convIds.push(convId);
  }

  // 6. Seed Messages (15 messages across conversations)
  const staffMessages = [
    'Hello! How can I help you today?',
    'Your reservation has been confirmed.',
    'The fitting session is scheduled for tomorrow at 2 PM.',
    'We have new arrivals that might interest you!',
    'Thank you for choosing JezSy Collection.',
  ];
  const customerMessages = [
    'Hi, I want to inquire about availability.',
    'Thank you so much!',
    'Can I see other color options?',
    'What time should I come for the fitting?',
    'I would like to reserve the midnight gown.',
  ];
  for (let i = 0; i < 15; i++) {
    const convId = convIds[i % convIds.length];
    const isStaff = i % 2 === 0;
    progress(`Creating message ${i + 1}/15`);
    await addDocument('messages', {
      id: i + 1,
      conversationId: convId,
      sender: isStaff ? 'staff' : 'customer',
      text: isStaff ? pick(staffMessages) : pick(customerMessages),
      time: new Date(Date.now() - (15 - i) * 3600000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  }

  progress('Demo data seeding complete!');
  return {
    customers: customerIds.length,
    products: productIds.length,
    reservations: 20,
    conversations: convIds.length,
    messages: 15,
  };
};
