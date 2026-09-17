/**
 * Sizing Profiles & Taxonomy Resolver (Admin Dashboard)
 * 
 * Category-aware sizing architecture:
 * - Footwear: EU, US W, US M, UK canonical strings with reference-only conversions
 * - Accessories: Specific subcategory resolution (Belts cm/alpha, Hats, Rings, Bags/Scarves/Watches/Earrings One Size)
 * - Apparel: Alpha sizing (XS-3XL) + One Size
 */

export const FOOTWEAR_SYSTEMS = {
  EU: 'EU',
  US_W: 'US W',
  US_M: 'US M',
  UK: 'UK',
};

export const STANDARD_SIZES = {
  footwear: {
    EU: [
      'EU 35', 'EU 36', 'EU 37', 'EU 37.5', 'EU 38', 'EU 38.5',
      'EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 42.5', 'EU 43',
      'EU 44', 'EU 45', 'EU 46'
    ],
    US_W: [
      'US W 5', 'US W 5.5', 'US W 6', 'US W 6.5', 'US W 7',
      'US W 7.5', 'US W 8', 'US W 8.5', 'US W 9', 'US W 9.5',
      'US W 10', 'US W 10.5', 'US W 11'
    ],
    US_M: [
      'US M 7', 'US M 7.5', 'US M 8', 'US M 8.5', 'US M 9',
      'US M 9.5', 'US M 10', 'US M 10.5', 'US M 11', 'US M 11.5',
      'US M 12', 'US M 13'
    ],
    UK: [
      'UK 3', 'UK 3.5', 'UK 4', 'UK 4.5', 'UK 5',
      'UK 5.5', 'UK 6', 'UK 6.5', 'UK 7', 'UK 7.5',
      'UK 8', 'UK 8.5', 'UK 9', 'UK 9.5', 'UK 10'
    ],
  },
  accessories_belts: {
    CM: ['70 cm', '75 cm', '80 cm', '85 cm', '90 cm', '95 cm', '100 cm', '105 cm', '110 cm'],
    ALPHA: ['S', 'M', 'L', 'XL'],
    ONE_SIZE: ['One Size'],
  },
  accessories_hats: {
    ONE_SIZE: ['One Size'],
    ALPHA: ['S/M', 'M/L', 'L/XL'],
    CM: ['54 cm', '56 cm', '58 cm', '60 cm'],
  },
  accessories_rings: {
    US_RING: ['US 5', 'US 6', 'US 7', 'US 8', 'US 9', 'US 10', 'US 11'],
    ONE_SIZE: ['One Size'],
  },
  apparel: {
    ALPHA: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    ONE_SIZE: ['One Size'],
  },
};

/**
 * Reference-only footwear conversion map.
 * Conversions are approximate reference aids only; they are never authoritative.
 */
const FOOTWEAR_CONVERSION_TABLE = {
  // EU -> Reference equivalents
  'EU 35': 'US W 5 · UK 2.5',
  'EU 36': 'US W 6 · UK 3.5',
  'EU 37': 'US W 6.5 · UK 4',
  'EU 37.5': 'US W 7 · UK 4.5',
  'EU 38': 'US W 7.5 · UK 5',
  'EU 38.5': 'US W 8 · UK 5.5',
  'EU 39': 'US W 8.5 · UK 6',
  'EU 40': 'US W 9 · UK 6.5',
  'EU 41': 'US W 9.5 · US M 8 · UK 7',
  'EU 42': 'US W 10 · US M 8.5 · UK 7.5',
  'EU 42.5': 'US M 9 · UK 8.5',
  'EU 43': 'US M 9.5 · UK 8.5',
  'EU 44': 'US M 10.5 · UK 9.5',
  'EU 45': 'US M 11.5 · UK 10.5',
  'EU 46': 'US M 12 · UK 11',

  // US W -> Reference equivalents
  'US W 5': 'EU 35 · UK 2.5',
  'US W 5.5': 'EU 35.5 · UK 3',
  'US W 6': 'EU 36 · UK 3.5',
  'US W 6.5': 'EU 37 · UK 4',
  'US W 7': 'EU 37.5 · UK 4.5',
  'US W 7.5': 'EU 38 · UK 5',
  'US W 8': 'EU 38.5 · UK 5.5',
  'US W 8.5': 'EU 39 · UK 6',
  'US W 9': 'EU 40 · UK 6.5',
  'US W 9.5': 'EU 41 · UK 7',
  'US W 10': 'EU 42 · UK 7.5',
  'US W 10.5': 'EU 42.5 · UK 8',
  'US W 11': 'EU 43 · UK 8.5',

  // US M -> Reference equivalents
  'US M 7': 'EU 40 · UK 6',
  'US M 7.5': 'EU 40.5 · UK 6.5',
  'US M 8': 'EU 41 · UK 7',
  'US M 8.5': 'EU 42 · UK 7.5',
  'US M 9': 'EU 42.5 · UK 8.5',
  'US M 9.5': 'EU 43 · UK 8.5',
  'US M 10': 'EU 44 · UK 9',
  'US M 10.5': 'EU 44.5 · UK 9.5',
  'US M 11': 'EU 45 · UK 10',
  'US M 11.5': 'EU 45.5 · UK 10.5',
  'US M 12': 'EU 46 · UK 11',
  'US M 13': 'EU 47 · UK 12',

  // UK -> Reference equivalents
  'UK 3': 'EU 35.5 · US W 5.5',
  'UK 3.5': 'EU 36 · US W 6',
  'UK 4': 'EU 37 · US W 6.5',
  'UK 4.5': 'EU 37.5 · US W 7',
  'UK 5': 'EU 38 · US W 7.5',
  'UK 5.5': 'EU 38.5 · US W 8',
  'UK 6': 'EU 39 · US W 8.5',
  'UK 6.5': 'EU 40 · US W 9',
  'UK 7': 'EU 41 · US W 9.5 · US M 8',
  'UK 7.5': 'EU 42 · US W 10 · US M 8.5',
  'UK 8': 'EU 42.5 · US M 9',
  'UK 8.5': 'EU 43 · US M 9.5',
  'UK 9': 'EU 43.5 · US M 10',
  'UK 9.5': 'EU 44 · US M 10.5',
  'UK 10': 'EU 45 · US M 11',
};

const ONE_SIZE_ALIASES = new Set([
  'one size',
  'onesize',
  'one-size',
  'os',
  'free size',
  'freesize',
]);

/**
 * Resolves the sizing profile based on category, subcategory, and optional product title.
 * Most-specific subcategory takes priority over generic parent categories.
 */
export function resolveSizingProfile(category = '', subCategory = '', productName = '') {
  const normCat = String(category || '').trim().toLowerCase();
  const normSub = String(subCategory || '').trim().toLowerCase();
  const normName = String(productName || '').trim().toLowerCase();

  // 1. Most-specific subcategory overrides
  // Rings override generic Jewelry/Accessories
  if (
    normSub === 'rings' ||
    normSub === 'ring' ||
    normSub === 'accessories-rings' ||
    (/\bring(s)?\b/i.test(normName) && (normCat === 'accessories' || normSub.includes('jewel')))
  ) {
    return 'accessories_rings';
  }

  // Belts
  if (normSub === 'belts' || normSub === 'belt' || normSub === 'accessories-belts') {
    return 'accessories_belts';
  }

  // Hats & caps
  if (
    normSub === 'hats / caps' ||
    normSub === 'accessories-hats' ||
    normSub.includes('hat') ||
    normSub.includes('cap')
  ) {
    return 'accessories_hats';
  }

  // Other specific accessories that are strictly One Size
  if (
    normSub === 'bags' ||
    normSub === 'accessories-bags' ||
    normSub === 'scarves' ||
    normSub === 'accessories-scarves' ||
    normSub === 'earings' ||
    normSub === 'earrings' ||
    normSub === 'watch' ||
    normSub === 'watches' ||
    normSub === 'accessories-jewelry' ||
    normSub === 'jewelry'
  ) {
    return 'one_size';
  }

  // 2. Footwear parent category or footwear subcategories
  if (
    normCat === 'footwear' ||
    normSub.startsWith('footwear-') ||
    ['sneakers', 'sandals', 'heels', 'flats', 'boots', 'slippers'].includes(normSub)
  ) {
    return 'footwear';
  }

  // 3. Generic Accessories fallback
  if (normCat === 'accessories') {
    return 'one_size';
  }

  // 4. Default Apparel
  return 'apparel';
}

/**
 * Formats footwear display strings and provides approximate reference helper.
 * Only treats bare numbers as EU when category === 'Footwear'.
 * Ring sizes like 'US 5' are NEVER treated as footwear.
 */
export function formatFootwearDisplay(rawSize, category = '') {
  if (!rawSize) {
    return { displayLabel: '', approxHelper: null, canonicalKey: '' };
  }

  const str = String(rawSize).trim();
  const normCat = String(category || '').trim().toLowerCase();
  const isFootwear = normCat === 'footwear';

  if (!isFootwear) {
    return {
      displayLabel: str,
      approxHelper: null,
      canonicalKey: str,
    };
  }

  // Bare numeric string in Footwear context (e.g. "38", "38.5")
  const isBareNumber = /^\d+(\.\d+)?$/.test(str);
  if (isBareNumber) {
    const euKey = `EU ${str}`;
    const helper = FOOTWEAR_CONVERSION_TABLE[euKey] || null;
    return {
      displayLabel: euKey,
      approxHelper: helper ? `Approx. ${helper}` : null,
      canonicalKey: str, // Retain exact bare key for DB inventory matching!
    };
  }

  // Prefixed footwear formats: "EU 38", "US W 7", "US M 9", "UK 5"
  const helper = FOOTWEAR_CONVERSION_TABLE[str] || null;
  return {
    displayLabel: str,
    approxHelper: helper ? `Approx. ${helper}` : null,
    canonicalKey: str,
  };
}

/**
 * Classifies sizing state into TRUE_ONE_SIZE, MULTI_SIZE, or UNAVAILABLE.
 * Never manufactures "One Size" from empty data.
 */
export function classifySizeState(sizes, variants = []) {
  const rawSizes = Array.isArray(sizes) ? sizes.filter((s) => s !== null && s !== undefined && String(s).trim() !== '') : [];

  // Check if sizes array is empty: attempt fallback to existing inventory variants
  let effectiveSizes = rawSizes;
  if (effectiveSizes.length === 0 && Array.isArray(variants) && variants.length > 0) {
    const variantSizes = Array.from(
      new Set(variants.map((v) => v?.size).filter((s) => s !== null && s !== undefined && String(s).trim() !== ''))
    );
    if (variantSizes.length > 0) {
      effectiveSizes = variantSizes;
    }
  }

  // If still empty: Sizing is missing / invalid
  if (effectiveSizes.length === 0) {
    return {
      state: 'UNAVAILABLE',
      canonicalToken: null,
      displaySizes: [],
      hideSelector: true,
    };
  }

  // Solitary size check
  if (effectiveSizes.length === 1) {
    const raw = String(effectiveSizes[0]).trim();
    if (ONE_SIZE_ALIASES.has(raw.toLowerCase())) {
      return {
        state: 'TRUE_ONE_SIZE',
        canonicalToken: raw, // Preserves exact raw token ('OS', 'Free Size', 'One Size')
        displaySizes: ['One Size'],
        hideSelector: true,
      };
    }
  }

  // Multi-size
  return {
    state: 'MULTI_SIZE',
    canonicalToken: null,
    displaySizes: effectiveSizes,
    hideSelector: false,
  };
}
