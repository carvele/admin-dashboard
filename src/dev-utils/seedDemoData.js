/**
 * Demo Data Seeder for JezSy Collection Admin
 *
 * Seeds Firestore with realistic 90-day operational data.
 * Designed to run ONCE from Settings → Developer Tools.
 */
import { addDocument } from '../lib/supabaseService';
import { supabase } from '../lib/supabaseClient';

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

// category/subCategory/categoryId reflect the live taxonomy (10 main
// categories seeded 2026-07-20) rather than the retired 6-category tree —
// keep these in sync with supabase/migrations/*_seed_new_taxonomy.sql in
// jezsy-mobile-app if the taxonomy changes again.
const PRODUCTS = [
  {
    name: 'Midnight Elegance Gown',
    category: 'Dresses & Jumpsuits',
    subCategory: 'Formal dresses',
    categoryId: 'a4444444-0000-0000-0000-000000000002',
    price: 15000,
    material: 'Silk',
    color: 'Black',
    fitAndSizing: 'Slim Fit',
    season: 'All-Season',
    occasion: 'Formal',
    sizes: ['S', 'M', 'L'],
    visibility: 'public',
    featured: true,
  },
  {
    name: 'Summer Breeze Set',
    category: 'Tops',
    subCategory: 'T-Shirts',
    categoryId: 'a9999999-0000-0000-0000-000000000001',
    price: 4500,
    material: 'Linen',
    color: 'White',
    fitAndSizing: 'Regular Fit',
    season: 'Summer',
    occasion: 'Casual',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    visibility: 'public',
    featured: false,
  },
  {
    name: 'Royal Wedding Gown',
    category: 'Dresses & Jumpsuits',
    subCategory: 'Formal dresses',
    categoryId: 'a4444444-0000-0000-0000-000000000002',
    price: 35000,
    material: 'Tulle & Lace',
    color: 'Ivory',
    fitAndSizing: 'True to Size',
    season: 'All-Season',
    occasion: 'Wedding',
    sizes: ['S', 'M', 'L'],
    visibility: 'public',
    featured: true,
  },
  {
    name: 'Business Elite Blazer',
    category: 'Outerwear',
    subCategory: 'Blazers',
    categoryId: 'a8888888-0000-0000-0000-000000000003',
    price: 8500,
    material: 'Wool Blend',
    color: 'Navy',
    fitAndSizing: 'Regular Fit',
    season: 'Autumn',
    occasion: 'Business',
    sizes: ['S', 'M', 'L', 'XL'],
    visibility: 'public',
    featured: false,
  },
  {
    name: 'Party Night Sequin Top',
    category: 'Tops',
    subCategory: 'Tank tops / camis',
    categoryId: 'a9999999-0000-0000-0000-000000000002',
    price: 6200,
    material: 'Sequin Mesh',
    color: 'Gold',
    fitAndSizing: 'Slim Fit',
    season: 'All-Season',
    occasion: 'Party',
    sizes: ['XS', 'S', 'M'],
    visibility: 'public',
    featured: true,
  },
  {
    name: 'Resort Maxi Dress',
    category: 'Dresses & Jumpsuits',
    subCategory: 'Maxi / midi / mini',
    categoryId: 'a4444444-0000-0000-0000-000000000003',
    price: 9800,
    material: 'Chiffon',
    color: 'Coral',
    fitAndSizing: 'Oversized',
    season: 'Summer',
    occasion: 'Resort',
    sizes: ['S', 'M', 'L', 'XL'],
    visibility: 'public',
    featured: false,
  },
  {
    name: 'Classic Tailored Pants',
    category: 'Bottoms',
    subCategory: 'Pants / trousers',
    categoryId: 'a3333333-0000-0000-0000-000000000001',
    price: 5500,
    material: 'Cotton Twill',
    color: 'Charcoal',
    fitAndSizing: 'Regular Fit',
    season: 'All-Season',
    occasion: 'Business',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    visibility: 'public',
    featured: false,
  },
  {
    name: 'Cocktail Mini Dress',
    category: 'Dresses & Jumpsuits',
    subCategory: 'Formal dresses',
    categoryId: 'a4444444-0000-0000-0000-000000000002',
    price: 11000,
    material: 'Satin',
    color: 'Burgundy',
    fitAndSizing: 'Slim Fit',
    season: 'Winter',
    occasion: 'Party',
    sizes: ['XS', 'S', 'M', 'L'],
    visibility: 'draft',
    featured: false,
  },
];

const STATUSES = ['Pending', 'To Pay', 'Preparing', 'To Pickup', 'Completed', 'Cancelled'];

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

  // products.created_by is a uuid FK, not free text — use the signed-in
  // owner/admin running this tool rather than a fabricated identity.
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const createdBy = currentUser?.id ?? null;

  // 1. Prepare demo customers (no DB write)
  // There is no `users` table, and `public.profiles` rows are only ever
  // created by the handle_new_user trigger on a real auth.users signup —
  // direct client inserts into profiles are blocked by RLS (see
  // 20260720170000_fix_profiles_insert_ownership.sql). A synthetic demo
  // customer has no backing auth account, so it can't have a profiles row
  // or a real id. Reservations below reference these by customer_name text
  // only; customer_id is left null since there's no profiles row to point
  // an FK at.
  const customerIds = [];
  for (const cust of CUSTOMERS) {
    progress(`Preparing customer: ${cust.name}`);
    customerIds.push({ id: null, name: cust.name });
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
    const { featured, ...productFields } = p;
    const docId = await addDocument('products', {
      ...productFields,
      id: sku,
      stock: Math.floor(Math.random() * 15) + 3,
      isFeatured: featured,
      tags: featured ? ['Featured', 'New Arrival'] : ['New Arrival'],
      imageUrl: '👗',
      images: [],
      description: `Premium ${p.material} ${p.category.toLowerCase()} for ${p.occasion.toLowerCase()} occasions.`,
      careInstructions: 'Dry clean recommended',
      styleCode: sku,
      created_by: createdBy,
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
  // staff_id / assigned_staff_id are FK-constrained to profiles.id, so they
  // must stay null here (no real staff profile to point at) — unlike
  // product_id, which can reference the products just seeded in step 2.
  // appointment_time is left null too: the validate_reservation_time
  // trigger only enforces store-hours/slot-capacity checks when both date
  // and appointment_time are set, so leaving it null keeps seeding simple.
  for (let i = 0; i < 20; i++) {
    const cust = pick(customerIds);
    const prod = pick(productIds);
    const status = pick(STATUSES);
    const daysAgo = Math.floor(Math.random() * 90);
    const rentalPrice = prod.price;
    const deposit = Math.round(rentalPrice * 0.5 * 100) / 100;
    progress(`Creating reservation ${i + 1}/20`);
    await addDocument('reservations', {
      display_id: `RES-SEED-${Date.now().toString(36).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      customer_id: null,
      customer_name: cust.name,
      product_id: prod.id,
      product_name: prod.name,
      size: pick(PRODUCTS.find((p) => p.name === prod.name)?.sizes || ['M']),
      quantity: 1,
      rental_price: rentalPrice,
      deposit,
      date: randomDate(daysAgo).slice(0, 10),
      status,
      staff_id: null,
      assigned_staff_id: null,
      countdown: status === 'Pending',
      payment_status: status === 'Pending' ? 'Pending' : 'Paid',
      payment_type: 'Deposit',
    });
  }

  // 5. Seed Conversations (5 threads)
  // conversations.customer_id is a nullable FK to profiles — left null here
  // since demo customers have no backing profiles row (see step 1). There is
  // no name/text column on conversations to record the demo customer by, so
  // the association only lives in-memory via convNames below.
  const convIds = [];
  const convNames = [];
  for (let i = 0; i < 5; i++) {
    const cust = customerIds[i % customerIds.length];
    progress(`Creating conversation with ${cust.name}`);
    const docId = await addDocument('conversations', {
      customerId: null,
      lastMessage: pick([
        'Thank you for the update!',
        'When will my fitting be scheduled?',
        'I love the new collection!',
        'Can I reschedule my appointment?',
        'Is the gown available in size S?',
      ]),
      lastMessageTime: new Date().toISOString(),
      unreadCount: Math.floor(Math.random() * 3),
    });
    convIds.push(docId);
    convNames.push(cust.name);
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
    const convIdx = i % convIds.length;
    const convId = convIds[convIdx];
    const isStaff = i % 2 === 0;
    progress(`Creating message ${i + 1}/15`);
    await addDocument('messages', {
      conversationId: convId,
      senderId: null,
      senderName: isStaff ? 'Staff' : convNames[convIdx],
      text: isStaff ? pick(staffMessages) : pick(customerMessages),
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
