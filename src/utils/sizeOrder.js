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

export function compareSizes(a, b) {
  if (a === b) return 0;

  // One Size is placed at the very beginning if solitary, or deterministically if mixed
  if (a === 'One Size') return -1;
  if (b === 'One Size') return 1;

  const rankA = APPAREL_SIZE_RANKS[a.toUpperCase()];
  const rankB = APPAREL_SIZE_RANKS[b.toUpperCase()];

  // Both are standard alpha apparel sizes
  if (rankA !== undefined && rankB !== undefined) {
    return rankA - rankB;
  }

  // One is apparel size, the other is not
  if (rankA !== undefined && rankB === undefined) return -1;
  if (rankA === undefined && rankB !== undefined) return 1;

  // Both are numeric sizes (e.g. shoe sizes '36', '37', or waist '28', '30')
  const numA = Number(a);
  const numB = Number(b);
  const isNumA = !Number.isNaN(numA) && a.trim() !== '';
  const isNumB = !Number.isNaN(numB) && b.trim() !== '';

  if (isNumA && isNumB) {
    return numA - numB;
  }

  // Numeric sizes come before custom/unknown labels
  if (isNumA && !isNumB) return -1;
  if (!isNumA && isNumB) return 1;

  // Deterministic alphabetical fallback for unknown/custom labels
  return a.localeCompare(b);
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

  // 4. Sort according to canonical apparel progression
  return unique.sort(compareSizes);
}
