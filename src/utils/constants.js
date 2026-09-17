/**
 * Product-related constants for the JezSy Admin Dashboard
 */

export const COLOR_CATEGORIES = [
  'White',
  'Gray',
  'Black',
  'Pink',
  'Red',
  'Beige',
  'Brown',
  'Yellow',
  'Green',
  'Blue',
  'Purple'
];

export const AVAILABLE_SIZES = ['One Size', 'XS', 'S', 'M', 'L', 'XL', '2XL'];

export const SEASONS = [
  'All-Season',
  'Dry Season (Summer)',
  'Wet Season (Rainy)',
  'Cool Season (-Ber Months)',
];

// Matched fuzzily (substring, singular/plural-insensitive) against a
// product's category/sub-category in MeasurementTable.jsx — so e.g. "Dress"
// already matches new sub-categories like "Casual dresses" without needing
// an entry per exact name. "Gowns" was dropped: the category it matched
// ("Ball Gowns") no longer exists in the taxonomy and nothing else contains
// that substring.
export const DEFAULT_MEASUREMENT_METRICS = {
  'Tops': ['Shoulder', 'Chest', 'Sleeve Length', 'Body Length'],
  'Bottoms': ['Waist', 'Hip', 'Thigh', 'Inseam', 'Outseam', 'Total Length'],
  'Dress': ['Bust', 'Waist', 'Hip', 'Shoulder', 'Total Length'],
  'Footwear': ['Foot Length', 'Foot Width'],
  'Outerwear': ['Shoulder', 'Chest', 'Sleeve Length', 'Total Length', 'Cuff'],
  'Bags': ['Width', 'Height', 'Depth', 'Strap Length'],
  'Belts': ['Total Length', 'Width', 'Waist Fit Min', 'Waist Fit Max'],
  'Hats': ['Circumference', 'Brim Width', 'Crown Height'],
  'Rings': ['Inner Diameter', 'Inner Circumference'],
};

export const COLOR_DOT_MAP = {
  blue: '#3b82f6',
  navy: '#1e3a8a',
  cream: '#fef3c7',
  yellow: '#eab308',
  red: '#ef4444',
  green: '#22c55e',
  emerald: '#10b981',
  black: '#1f2937',
  white: '#f3f4f6',
  gray: '#9ca3af',
  grey: '#9ca3af',
  pink: '#ec4899',
  purple: '#a855f7',
  orange: '#f97316',
  brown: '#78350f',
  rust: '#b7410e',
  terracotta: '#c2593f',
  burgundy: '#800020',
  coral: '#f87171',
  lavender: '#c084fc',
  sage: '#9aa889',
  mustard: '#d97706',
  charcoal: '#374151',
  khaki: '#c3b091',
  silver: '#cbd5e1',
  tan: '#d2b48c',
  plum: '#701a75',
  copper: '#b87333',
  bronze: '#cd7f32',
  lilac: '#c084fc',
  mint: '#6ee7b7',
  ivory: '#fffff0',
  champagne: '#f7e7ce',
  rose: '#f43f5e',
  peach: '#fdba74',
  taupe: '#b38b6d',
  beige: '#f5f5dc',
  olive: '#84cc16',
  maroon: '#800000',
  teal: '#14b8a6',
  gold: '#d4af37',
  salmon: '#fa8072',
  cyan: '#06b6d4',
  violet: '#7c3aed',
  magenta: '#d946ef',
};

export const getChipColorDot = (name) => {
  if (!name) return '#cbd5e1';
  const clean = String(name).toLowerCase().trim();
  for (const [key, hex] of Object.entries(COLOR_DOT_MAP)) {
    if (clean.includes(key)) return hex;
  }
  return '#cbd5e1';
};
