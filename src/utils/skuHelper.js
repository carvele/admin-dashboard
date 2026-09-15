/**
 * @fileoverview skuHelper.js
 * Canonical SKU and style code utilities for the JezSy platform.
 *
 * Centralizes style-code and variant-SKU normalization, generation, validation,
 * and resolution. Guarantees that raw database UUIDs (product IDs or inventory IDs)
 * are NEVER displayed as retail SKUs to staff or customers.
 *
 * Contract:
 *   Canonical product style code (e.g. JZ-AS-6956)
 *           ↓
 *   Canonical variant SKU (e.g. JZ-AS-6956-BROWN-M)
 *           ↓
 *   resolveVariantSku()
 *           ↓
 *   Consumers: Inventory table, search, CSV export, restock, sale modal
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTAINS_UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Checks whether a string is a valid UUID.
 * @param {*} value
 * @returns {boolean}
 */
export const isUuid = (value) => {
  if (!value || typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
};

/**
 * Checks whether a string contains a UUID anywhere within it (e.g. UUID prefix in SKU).
 * @param {*} value
 * @returns {boolean}
 */
export const containsUuid = (value) => {
  if (!value || typeof value !== 'string') return false;
  return CONTAINS_UUID_REGEX.test(value);
};

/**
 * Validates whether a candidate string is usable as a human-facing retail SKU.
 * Must be non-empty, not a UUID, not containing a UUID, and not matching the product or inventory ID.
 *
 * @param {*} value
 * @param {{ productId?: string, inventoryId?: string }} [context]
 * @returns {boolean}
 */
export const isUsableSku = (value, { productId = '', inventoryId = '' } = {}) => {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isUuid(trimmed)) return false;
  if (containsUuid(trimmed)) return false;
  if (productId && trimmed.toLowerCase() === String(productId).trim().toLowerCase()) return false;
  if (inventoryId && trimmed.toLowerCase() === String(inventoryId).trim().toLowerCase()) return false;
  return true;
};

/**
 * Standardizes garment sizes according to JezSy retail standards.
 * "One Size" → OS, "Medium" → M, "Small" → S, "Large" → L, "X-Large" → XL.
 *
 * @param {string} size
 * @returns {string}
 */
export const normalizeSize = (size) => {
  if (!size || typeof size !== 'string') return '';
  const trimmed = size.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'one size' || lower === 'onesize' || lower === 'os') return 'OS';
  if (lower === 'extra small' || lower === 'xs') return 'XS';
  if (lower === 'small' || lower === 's') return 'S';
  if (lower === 'medium' || lower === 'm') return 'M';
  if (lower === 'large' || lower === 'l') return 'L';
  if (lower === 'extra large' || lower === 'x-large' || lower === 'xl') return 'XL';
  if (lower === '2x-large' || lower === 'xx-large' || lower === 'xxl' || lower === '2xl') return '2XL';
  if (lower === '3x-large' || lower === 'xxxl' || lower === '3xl') return '3XL';
  return trimmed.toUpperCase().replace(/[^A-Z0-9-]/g, '');
};

/**
 * Standardizes color strings for variant SKUs.
 * "Dark Brown" → DARK-BROWN, "rust / orange" → RUST-ORANGE.
 *
 * @param {string} color
 * @returns {string}
 */
export const normalizeColor = (color) => {
  if (!color || typeof color !== 'string') return '';
  return color
    .trim()
    .toUpperCase()
    .replace(/[\s\/\\]+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * Guarantees a deterministic, valid JezSy style code (`JZ-{PREFIX}-{NNNN}`).
 * If an existing usable style code is present, it is preserved.
 *
 * @param {{ existingStyleCode?: string, productName?: string, productId?: string }} params
 * @returns {string}
 */
export const ensureStyleCode = ({ existingStyleCode, productName = '', productId = '' } = {}) => {
  if (isUsableSku(existingStyleCode, { productId })) {
    return existingStyleCode.trim().toUpperCase();
  }

  const words = String(productName).trim().split(/\s+/).filter(Boolean);
  let prefix = 'ITM';
  if (words.length >= 2) {
    prefix = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    prefix = words[0].substring(0, Math.min(3, words[0].length)).toUpperCase();
  }
  prefix = prefix.replace(/[^A-Z0-9]/g, '') || 'ITM';

  // Generate deterministic 4-digit code (1000-9999) from productId or fallback
  let numPart = '';
  if (productId) {
    let hash = 0;
    const str = String(productId);
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    numPart = String(1000 + (hash % 9000));
  } else {
    numPart = '1001';
  }

  return `JZ-${prefix}-${numPart}`;
};

/**
 * Canonical variant SKU builder. Supports both signature styles:
 * 1. buildVariantSku({ styleCode, color, size, pattern })
 * 2. buildVariantSku(baseSku, { size, color, pattern }) (legacy compatibility)
 *
 * Format: `STYLECODE-COLOR-PATTERN-SIZE`
 *
 * @param {string|Object} styleCodeOrOptions
 * @param {Object} [legacyOptions]
 * @returns {string|null}
 */
export const buildVariantSku = (styleCodeOrOptions, legacyOptions = {}) => {
  let styleCode = '';
  let color = '';
  let size = '';
  let pattern = '';

  if (typeof styleCodeOrOptions === 'object' && styleCodeOrOptions !== null) {
    styleCode = styleCodeOrOptions.styleCode || styleCodeOrOptions.sku || styleCodeOrOptions.baseSku || '';
    color = styleCodeOrOptions.color || '';
    size = styleCodeOrOptions.size || '';
    pattern = styleCodeOrOptions.pattern || '';
  } else {
    styleCode = styleCodeOrOptions || '';
    color = legacyOptions.color || '';
    size = legacyOptions.size || '';
    pattern = legacyOptions.pattern || '';
  }

  const base = String(styleCode ?? '').trim();
  if (!base || isUuid(base) || containsUuid(base)) return null;

  const cleanBase = base.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const c = normalizeColor(color);
  const p = pattern ? String(pattern).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') : '';
  const s = normalizeSize(size);

  const parts = [cleanBase];
  if (c) parts.push(c);
  if (p) parts.push(p);
  if (s) parts.push(s);

  return parts.join('-');
};

/**
 * Resolves the display/export SKU for an inventory item with guaranteed fallback priority:
 *
 * 1. valid variant_sku
 * 2. valid sku
 * 3. parent style_code + normalized color + normalized size
 * 4. deterministic generated JezSy style code + color + size
 * 5. "--" only if there truly is insufficient product identity
 *
 * @param {Object} item - Inventory row
 * @param {Object} [parentProduct] - Linked product metadata
 * @returns {string}
 */
export const resolveVariantSku = (item, parentProduct = null) => {
  if (!item) return '--';

  const productId = item.productDocId || item.product_doc_id || parentProduct?.id || '';
  const inventoryId = item.id || item.docId || '';

  // 1. Valid variant_sku
  const variantSku = item.variantSku || item.variant_sku;
  if (isUsableSku(variantSku, { productId, inventoryId })) {
    return variantSku.trim().toUpperCase();
  }

  // 2. Valid sku
  const sku = item.sku;
  if (isUsableSku(sku, { productId, inventoryId })) {
    const trimmedSku = sku.trim().toUpperCase();
    // If sku already includes color/size (e.g. JZ-AS-6956-BROWN-M), return it directly
    const normSize = normalizeSize(item.size);
    const normColor = normalizeColor(item.color);
    if ((normSize && trimmedSku.endsWith(normSize)) || (normColor && trimmedSku.includes(normColor))) {
      return trimmedSku;
    }
    // Otherwise extend the base sku with variant dimensions
    const built = buildVariantSku(trimmedSku, {
      color: item.color,
      size: item.size,
      pattern: item.pattern,
    });
    if (built) return built;
    return trimmedSku;
  }

  // 3. Parent style_code + normalized color + normalized size
  const parentStyleCode = parentProduct?.styleCode || parentProduct?.style_code;
  if (isUsableSku(parentStyleCode, { productId, inventoryId })) {
    const built = buildVariantSku(parentStyleCode, {
      color: item.color,
      size: item.size,
      pattern: item.pattern,
    });
    if (built) return built;
  }

  // 4. Deterministic generated JezSy style code + color + size
  const productName = item.item || parentProduct?.name || '';
  if (productName.trim() || productId) {
    const generatedStyleCode = ensureStyleCode({
      productName,
      productId,
    });
    const built = buildVariantSku(generatedStyleCode, {
      color: item.color,
      size: item.size,
      pattern: item.pattern,
    });
    if (built) return built;
    return generatedStyleCode;
  }

  // 5. Fallback
  return '--';
};
