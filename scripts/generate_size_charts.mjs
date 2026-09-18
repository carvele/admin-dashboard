import fs from 'fs';
import path from 'path';

// Template specifications (all values in cm)
const SIZES_ALPHA = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

const TEMPLATES = {
  tops: {
    metrics: ['bust', 'waist', 'shoulderWidth', 'sleeveLength', 'length'],
    XS: { bust: 84, waist: 66, shoulderWidth: 37, sleeveLength: 57, length: 58 },
    S:  { bust: 88, waist: 70, shoulderWidth: 38, sleeveLength: 58, length: 60 },
    M:  { bust: 94, waist: 76, shoulderWidth: 40, sleeveLength: 59, length: 62 },
    L:  { bust: 100, waist: 82, shoulderWidth: 42, sleeveLength: 60, length: 64 },
    XL: { bust: 106, waist: 88, shoulderWidth: 44, sleeveLength: 61, length: 66 },
    '2XL': { bust: 112, waist: 94, shoulderWidth: 46, sleeveLength: 62, length: 68 },
  },
  outerwear: {
    metrics: ['bust', 'waist', 'shoulderWidth', 'sleeveLength', 'totalLength'],
    XS: { bust: 92, waist: 78, shoulderWidth: 39, sleeveLength: 58, totalLength: 70 },
    S:  { bust: 96, waist: 82, shoulderWidth: 40, sleeveLength: 59, totalLength: 72 },
    M:  { bust: 102, waist: 88, shoulderWidth: 42, sleeveLength: 60, totalLength: 74 },
    L:  { bust: 108, waist: 94, shoulderWidth: 44, sleeveLength: 61, totalLength: 76 },
    XL: { bust: 114, waist: 100, shoulderWidth: 46, sleeveLength: 62, totalLength: 78 },
    '2XL': { bust: 120, waist: 106, shoulderWidth: 48, sleeveLength: 63, totalLength: 80 },
  },
  pants: {
    metrics: ['waist', 'hips', 'thigh', 'inseam', 'outseam'],
    XS: { waist: 64, hips: 88, thigh: 52, inseam: 74, outseam: 98 },
    S:  { waist: 68, hips: 92, thigh: 54, inseam: 75, outseam: 100 },
    M:  { waist: 74, hips: 98, thigh: 57, inseam: 76, outseam: 102 },
    L:  { waist: 80, hips: 104, thigh: 60, inseam: 77, outseam: 104 },
    XL: { waist: 86, hips: 110, thigh: 63, inseam: 78, outseam: 106 },
    '2XL': { waist: 92, hips: 116, thigh: 66, inseam: 78, outseam: 107 },
  },
  leggings: {
    metrics: ['waist', 'hips', 'inseam', 'totalLength'],
    XS: { waist: 60, hips: 84, inseam: 68, totalLength: 92 },
    S:  { waist: 64, hips: 88, inseam: 69, totalLength: 94 },
    M:  { waist: 70, hips: 94, inseam: 70, totalLength: 96 },
    L:  { waist: 76, hips: 100, inseam: 71, totalLength: 98 },
    XL: { waist: 82, hips: 106, inseam: 72, totalLength: 100 },
    '2XL': { waist: 88, hips: 112, inseam: 73, totalLength: 102 },
  },
  shorts: {
    metrics: ['waist', 'hips', 'thigh', 'inseam', 'outseam'],
    XS: { waist: 64, hips: 88, thigh: 54, inseam: 10, outseam: 34 },
    S:  { waist: 68, hips: 92, thigh: 56, inseam: 11, outseam: 36 },
    M:  { waist: 74, hips: 98, thigh: 59, inseam: 12, outseam: 38 },
    L:  { waist: 80, hips: 104, thigh: 62, inseam: 13, outseam: 40 },
    XL: { waist: 86, hips: 110, thigh: 65, inseam: 14, outseam: 42 },
  },
  skirts: {
    metrics: ['waist', 'hips', 'totalLength'],
    XS: { waist: 64, hips: 88, totalLength: 46 },
    S:  { waist: 68, hips: 92, totalLength: 48 },
    M:  { waist: 74, hips: 98, totalLength: 50 },
    L:  { waist: 80, hips: 104, totalLength: 52 },
    XL: { waist: 86, hips: 110, totalLength: 54 },
  },
  dresses: {
    metrics: ['bust', 'waist', 'hips', 'shoulderWidth', 'totalLength'],
    XS: { bust: 84, waist: 66, hips: 90, shoulderWidth: 37, totalLength: 96 },
    S:  { bust: 88, waist: 70, hips: 94, shoulderWidth: 38, totalLength: 98 },
    M:  { bust: 94, waist: 76, hips: 100, shoulderWidth: 40, totalLength: 100 },
    L:  { bust: 100, waist: 82, hips: 106, shoulderWidth: 42, totalLength: 102 },
    XL: { bust: 106, waist: 88, hips: 112, shoulderWidth: 44, totalLength: 104 },
  },
  jumpsuits: {
    metrics: ['bust', 'waist', 'hips', 'inseam', 'totalLength'],
    XS: { bust: 84, waist: 66, hips: 90, inseam: 72, totalLength: 138 },
    S:  { bust: 88, waist: 70, hips: 94, inseam: 73, totalLength: 140 },
    M:  { bust: 94, waist: 76, hips: 100, inseam: 74, totalLength: 142 },
    L:  { bust: 100, waist: 82, hips: 106, inseam: 75, totalLength: 144 },
    XL: { bust: 106, waist: 88, hips: 112, inseam: 76, totalLength: 146 },
  },
  pajamas: {
    metrics: ['bust', 'waist', 'hips', 'totalLength'],
    XS: { bust: 86, waist: 66, hips: 90, totalLength: 62 },
    S:  { bust: 90, waist: 70, hips: 94, totalLength: 64 },
    M:  { bust: 96, waist: 76, hips: 100, totalLength: 66 },
    L:  { bust: 102, waist: 82, hips: 106, totalLength: 68 },
    XL: { bust: 108, waist: 88, hips: 112, totalLength: 70 },
  },
  robes: {
    metrics: ['bust', 'waist', 'sleeveLength', 'totalLength'],
    S:  { bust: 96, waist: 88, sleeveLength: 56, totalLength: 110 },
    M:  { bust: 102, waist: 94, sleeveLength: 57, totalLength: 112 },
    L:  { bust: 108, waist: 100, sleeveLength: 58, totalLength: 114 },
  },
  bras: {
    metrics: ['bust', 'underbust'],
    XS: { bust: 80, underbust: 65 },
    S:  { bust: 85, underbust: 70 },
    M:  { bust: 90, underbust: 75 },
    L:  { bust: 95, underbust: 80 },
    XL: { bust: 100, underbust: 85 },
    '2XL': { bust: 105, underbust: 90 },
  },
  shapewear: {
    metrics: ['waist', 'hips', 'bust', 'totalLength'],
    XS: { waist: 60, hips: 84, bust: 80, totalLength: 54 },
    S:  { waist: 64, hips: 88, bust: 84, totalLength: 56 },
    M:  { waist: 70, hips: 94, bust: 90, totalLength: 58 },
    L:  { waist: 76, hips: 100, bust: 96, totalLength: 60 },
    XL: { waist: 82, hips: 106, bust: 102, totalLength: 62 },
    '2XL': { waist: 88, hips: 112, bust: 108, totalLength: 64 },
  },
  swimwear: {
    metrics: ['bust', 'waist', 'hips'],
    'One Size': { bust: 88, waist: 70, hips: 94 },
    XS: { bust: 82, waist: 64, hips: 88 },
    S:  { bust: 86, waist: 68, hips: 92 },
    M:  { bust: 92, waist: 74, hips: 98 },
  },
  footwear: {
    metrics: ['footLength', 'footWidth'],
    '36': { footLength: 23.0, footWidth: 8.5 },
    '37': { footLength: 23.5, footWidth: 8.7 },
    '38': { footLength: 24.0, footWidth: 9.0 },
    '39': { footLength: 24.5, footWidth: 9.2 },
    '40': { footLength: 25.0, footWidth: 9.5 },
    '41': { footLength: 25.5, footWidth: 9.7 },
    S:    { footLength: 23.5, footWidth: 8.7 },
    M:    { footLength: 24.5, footWidth: 9.2 },
    L:    { footLength: 25.5, footWidth: 9.7 },
    'One Size': { footLength: 25.0, footWidth: 9.5 },
  },
  bags: {
    metrics: ['width', 'height', 'depth', 'strapLength'],
    'One Size': { width: 28, height: 20, depth: 10, strapLength: 110 },
    XS: { width: 20, height: 14, depth: 7, strapLength: 105 },
    S:  { width: 24, height: 17, depth: 8, strapLength: 110 },
  },
  belts: {
    metrics: ['totalLength', 'width', 'waistFitMin', 'waistFitMax'],
    'One Size': { totalLength: 105, width: 3.0, waistFitMin: 70, waistFitMax: 95 },
    S: { totalLength: 95, width: 3.0, waistFitMin: 65, waistFitMax: 80 },
    M: { totalLength: 105, width: 3.0, waistFitMin: 75, waistFitMax: 90 },
    L: { totalLength: 115, width: 3.0, waistFitMin: 85, waistFitMax: 100 },
  },
  hats: {
    metrics: ['circumference', 'brimWidth', 'crownHeight'],
    'One Size': { circumference: 57, brimWidth: 7, crownHeight: 12 },
  },
  scarves: {
    metrics: ['totalLength', 'width'],
    'One Size': { totalLength: 180, width: 40 },
  },
  watches: {
    metrics: ['caseDiameter', 'bandWidth', 'bandLength'],
    'One Size': { caseDiameter: 3.6, bandWidth: 1.8, bandLength: 21.0 },
  },
  jewelry: {
    metrics: ['length', 'width'],
    'One Size': { length: 4.5, width: 2.0 },
    M: { length: 4.5, width: 2.0 },
  },
};

export function resolveTemplateKey(category, subCategory, name = '') {
  const cat = (category || '').toLowerCase().trim();
  const sub = (subCategory || '').toLowerCase().trim();
  const nm = (name || '').toLowerCase().trim();

  // 1. Accessories
  if (cat.includes('accessories')) {
    if (sub.includes('bag')) return 'bags';
    if (sub.includes('belt')) return 'belts';
    if (sub.includes('hat') || sub.includes('cap')) return 'hats';
    if (sub.includes('scarf') || sub.includes('scarves')) return 'scarves';
    if (sub.includes('watch')) return 'watches';
    if (sub.includes('earing') || sub.includes('earring') || sub.includes('jewelry')) return 'jewelry';
    return 'jewelry';
  }

  // 2. Footwear
  if (cat.includes('footwear') || sub.includes('shoe') || sub.includes('boot') || sub.includes('flat') || sub.includes('heel') || sub.includes('slipper') || sub.includes('sneaker')) {
    return 'footwear';
  }

  // 3. Underwear & Intimates
  if (cat.includes('underwear') || cat.includes('intimates')) {
    if (sub.includes('bra')) return 'bras';
    if (sub.includes('shapewear')) return 'shapewear';
    return 'bras';
  }

  // 4. Activewear
  if (cat.includes('activewear')) {
    if (sub.includes('swim')) return 'swimwear';
    if (sub.includes('bra')) return 'bras';
    if (sub.includes('short')) return 'shorts';
    if (sub.includes('legging') || sub.includes('biker')) return 'leggings';
    if (sub.includes('top') || sub.includes('shirt')) return 'tops';
    return 'tops';
  }

  // 5. Loungewear & Sleepwear
  if (cat.includes('loungewear') || cat.includes('sleepwear')) {
    if (sub.includes('robe')) return 'robes';
    return 'pajamas';
  }

  // 6. Dresses & Jumpsuits
  if (cat.includes('dress') || cat.includes('jumpsuit')) {
    if (sub.includes('jumpsuit') || sub.includes('romper')) return 'jumpsuits';
    return 'dresses';
  }

  // 7. Outerwear
  if (cat.includes('outerwear') || sub.includes('jacket') || sub.includes('coat') || sub.includes('blazer') || sub.includes('hoodie') || sub.includes('cardigan') || sub.includes('parka')) {
    return 'outerwear';
  }

  // 8. Bottoms
  if (cat.includes('bottom')) {
    if (sub.includes('skirt')) return 'skirts';
    if (sub.includes('short')) return 'shorts';
    if (sub.includes('legging')) return 'leggings';
    return 'pants';
  }

  // 9. Tops
  if (cat.includes('top')) {
    return 'tops';
  }

  // Default fallback
  return 'tops';
}

export function generateProductMeasurements(product) {
  const { category, sub_category, name, sizes } = product;
  const templateKey = resolveTemplateKey(category, sub_category, name);
  const template = TEMPLATES[templateKey];

  if (!template) {
    throw new Error(`Missing template for key: ${templateKey}`);
  }

  const measurements = {};

  (sizes || []).forEach((sizeToken) => {
    // Exact match in template?
    if (template[sizeToken]) {
      measurements[sizeToken] = { ...template[sizeToken] };
      return;
    }

    // Is it a footwear alpha size (S/M/L) in footwear template?
    if (templateKey === 'footwear') {
      if (template[sizeToken]) {
        measurements[sizeToken] = { ...template[sizeToken] };
      } else if (sizeToken === 'S') {
        measurements[sizeToken] = { footLength: 23.5, footWidth: 8.7 };
      } else if (sizeToken === 'M') {
        measurements[sizeToken] = { footLength: 24.5, footWidth: 9.2 };
      } else if (sizeToken === 'L') {
        measurements[sizeToken] = { footLength: 25.5, footWidth: 9.7 };
      } else {
        measurements[sizeToken] = { footLength: 24.0, footWidth: 9.0 };
      }
      return;
    }

    // If size token is 'One Size'
    if (sizeToken === 'One Size') {
      if (template['One Size']) {
        measurements[sizeToken] = { ...template['One Size'] };
      } else if (template['M']) {
        measurements[sizeToken] = { ...template['M'] };
      } else {
        const firstKey = Object.keys(template).find((k) => k !== 'metrics');
        measurements[sizeToken] = { ...template[firstKey] };
      }
      return;
    }

    // If size token is standard alpha but missing in template, synthesize from M
    if (template['M']) {
      measurements[sizeToken] = { ...template['M'] };
      return;
    }

    // Otherwise grab first available size definition
    const firstKey = Object.keys(template).find((k) => k !== 'metrics');
    measurements[sizeToken] = { ...template[firstKey] };
  });

  return {
    templateKey,
    measurements,
  };
}
