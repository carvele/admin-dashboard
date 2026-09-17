// Canonical apparel size hierarchy ranks
export const APPAREL_SIZE_RANKS = {
  '3XS': 10,
  'XXS': 20,
  'XS': 30,
  'S': 40,
  'M': 50,
  'L': 60,
  'XL': 70,
  '2XL': 80,
  '3XL': 90,
  '4XL': 100,
  '5XL': 110,
};

// Hat / accessory combo size ranks
export const COMBO_SIZE_RANKS = {
  'XS/S': 25,
  'S/M': 35,
  'M/L': 55,
  'L/XL': 65,
  'XL/2XL': 75,
};

// Aliases normalized before deduplication
export const SIZE_ALIASES = {
  xxl: '2XL',
  '2xl': '2XL',
  xxxl: '3XL',
  '3xl': '3XL',
  xxxxl: '4XL',
  '4xl': '4XL',
  'free size': 'One Size',
  freesize: 'One Size',
  os: 'One Size',
  'one size': 'One Size',
  onesize: 'One Size',
  'one-size': 'One Size',
};

export function normalizeSingleSize(raw) {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (SIZE_ALIASES[lower]) {
    return SIZE_ALIASES[lower];
  }

  const upper = trimmed.toUpperCase();
  if (APPAREL_SIZE_RANKS[upper]) {
    return upper;
  }

  return trimmed;
}

export function validateSizingMode(sizes) {
  const normalized = (sizes || [])
    .map(normalizeSingleSize)
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));

  const hasOneSize = unique.includes('One Size');
  const hasGradedOrOther = unique.some((s) => s !== 'One Size');

  if (hasOneSize && hasGradedOrOther) {
    return {
      isValid: false,
      hasMixedOneSize: true,
      warning: 'Product combines One Size with graded or numeric sizes; One Size must be used as an exclusive sizing mode.',
    };
  }

  return {
    isValid: true,
    hasMixedOneSize: false,
  };
}

/**
 * Parses structured sizing patterns:
 * - Prefix systems: "EU 38.5", "US W 7.5", "US M 9", "UK 5", "US 8"
 * - Measurement units: "75 cm", "80 cm"
 */
function parseCompositeSize(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();

  // 1. Measurement unit suffix: "85 cm", "32 in"
  const unitMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(cm|in|mm)$/i);
  if (unitMatch) {
    return {
      type: 'unit',
      unit: unitMatch[2].toLowerCase(),
      value: parseFloat(unitMatch[1]),
    };
  }

  // 2. System prefix: "EU 38", "US W 7.5", "US M 9", "UK 5", "US 8"
  const prefixMatch = trimmed.match(/^(EU|US\s+[WM]|US|UK)\s+(\d+(?:\.\d+)?)$/i);
  if (prefixMatch) {
    // Normalize system prefix spacing/casing e.g. "US  W" -> "US W"
    const sys = prefixMatch[1].replace(/\s+/g, ' ').toUpperCase();
    return {
      type: 'prefix',
      system: sys,
      value: parseFloat(prefixMatch[2]),
    };
  }

  return null;
}

export function compareSizes(a, b) {
  if (a === b) return 0;

  const aStr = String(a).trim();
  const bStr = String(b).trim();

  // 1. One Size (or aliases) comes solitary first
  const isOneSizeA = aStr.toLowerCase() === 'one size' || SIZE_ALIASES[aStr.toLowerCase()] === 'One Size';
  const isOneSizeB = bStr.toLowerCase() === 'one size' || SIZE_ALIASES[bStr.toLowerCase()] === 'One Size';
  if (isOneSizeA && !isOneSizeB) return -1;
  if (!isOneSizeA && isOneSizeB) return 1;

  // 2. Standard alpha apparel sizes
  const rankA = APPAREL_SIZE_RANKS[aStr.toUpperCase()];
  const rankB = APPAREL_SIZE_RANKS[bStr.toUpperCase()];
  if (rankA !== undefined && rankB !== undefined) {
    return rankA - rankB;
  }
  if (rankA !== undefined && rankB === undefined) return -1;
  if (rankA === undefined && rankB !== undefined) return 1;

  // 3. Alpha combo sizes (e.g. S/M, M/L, L/XL)
  const comboA = COMBO_SIZE_RANKS[aStr.toUpperCase()];
  const comboB = COMBO_SIZE_RANKS[bStr.toUpperCase()];
  if (comboA !== undefined && comboB !== undefined) {
    return comboA - comboB;
  }
  if (comboA !== undefined && comboB === undefined) return -1;
  if (comboA === undefined && comboB !== undefined) return 1;

  // 4. Structured composite sizes (EU 38, US W 7.5, 80 cm, etc.)
  const compA = parseCompositeSize(aStr);
  const compB = parseCompositeSize(bStr);

  if (compA && compB) {
    if (compA.type === 'prefix' && compB.type === 'prefix' && compA.system === compB.system) {
      return compA.value - compB.value;
    }
    if (compA.type === 'unit' && compB.type === 'unit' && compA.unit === compB.unit) {
      return compA.value - compB.value;
    }
  }

  // 5. Pure numeric sizes (e.g. shoe sizes '36', '37', or waist '28', '30')
  const numA = Number(aStr);
  const numB = Number(bStr);
  const isNumA = !Number.isNaN(numA) && aStr !== '';
  const isNumB = !Number.isNaN(numB) && bStr !== '';

  if (isNumA && isNumB) {
    return numA - numB;
  }
  if (isNumA && !isNumB) return -1;
  if (!isNumA && isNumB) return 1;

  // 6. Natural alphanumeric fallback
  return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
}

export function normalizeSizes(rawSizes, options) {
  if (!rawSizes || !Array.isArray(rawSizes) || rawSizes.length === 0) {
    return [];
  }

  // 1. Normalize aliases & remove null/blank
  const normalized = rawSizes
    .map(normalizeSingleSize)
    .filter(Boolean);

  // 2. Deduplicate
  const unique = Array.from(new Set(normalized));

  // 3. Check sizing mode validation
  const validation = validateSizingMode(unique);
  if (!validation.isValid && validation.warning && options?.onWarning) {
    options.onWarning(validation.warning);
  }

  // 4. Sort according to canonical progression
  return unique.sort(compareSizes);
}
