import {
  isUuid,
  containsUuid,
  isUsableSku,
  normalizeSize,
  normalizeColor,
  ensureStyleCode,
  buildVariantSku,
  resolveVariantSku,
} from './skuHelper';

describe('skuHelper', () => {
  describe('isUuid and containsUuid', () => {
    it('detects valid UUIDs', () => {
      expect(isUuid('a292a766-6bf1-40e5-bf60-eb6830b7050d')).toBe(true);
      expect(isUuid('b0000008-0000-4000-8000-000000000002')).toBe(true);
      expect(isUuid('JZ-AS-6956')).toBe(false);
      expect(isUuid('')).toBe(false);
      expect(isUuid(null)).toBe(false);
    });

    it('detects strings containing embedded UUIDs', () => {
      expect(containsUuid('b0000008-0000-4000-8000-000000000002-BLUE-S')).toBe(true);
      expect(containsUuid('JZ-AS-6956-BROWN-M')).toBe(false);
    });
  });

  describe('isUsableSku', () => {
    it('rejects empty, null, and whitespace strings', () => {
      expect(isUsableSku('')).toBe(false);
      expect(isUsableSku('   ')).toBe(false);
      expect(isUsableSku(null)).toBe(false);
      expect(isUsableSku(undefined)).toBe(false);
    });

    it('rejects standalone UUIDs and UUID prefixes', () => {
      expect(isUsableSku('a292a766-6bf1-40e5-bf60-eb6830b7050d')).toBe(false);
      expect(isUsableSku('b0000008-0000-4000-8000-000000000002-BLUE-S')).toBe(false);
    });

    it('rejects values matching productId or inventoryId', () => {
      const prodId = 'prod-123';
      const invId = 'inv-456';
      expect(isUsableSku('prod-123', { productId: prodId })).toBe(false);
      expect(isUsableSku('inv-456', { inventoryId: invId })).toBe(false);
      expect(isUsableSku('JZ-AS-6956', { productId: prodId, inventoryId: invId })).toBe(true);
    });

    it('accepts valid brand and seed SKUs', () => {
      expect(isUsableSku('JZ-AS-6956')).toBe(true);
      expect(isUsableSku('JZ-AS-6956-BROWN-M')).toBe(true);
      expect(isUsableSku('SEED-B0000006-M')).toBe(true);
    });
  });

  describe('normalizeSize', () => {
    it('standardizes retail sizes', () => {
      expect(normalizeSize('One Size')).toBe('OS');
      expect(normalizeSize('onesize')).toBe('OS');
      expect(normalizeSize('os')).toBe('OS');
      expect(normalizeSize('Extra Small')).toBe('XS');
      expect(normalizeSize('Small')).toBe('S');
      expect(normalizeSize('Medium')).toBe('M');
      expect(normalizeSize('Large')).toBe('L');
      expect(normalizeSize('Extra Large')).toBe('XL');
      expect(normalizeSize('X-Large')).toBe('XL');
      expect(normalizeSize('2X-Large')).toBe('2XL');
      expect(normalizeSize('XXL')).toBe('2XL');
      expect(normalizeSize('38')).toBe('38');
    });

    it('handles empty or missing size safely', () => {
      expect(normalizeSize('')).toBe('');
      expect(normalizeSize(null)).toBe('');
    });
  });

  describe('normalizeColor', () => {
    it('formats multi-word colors with hyphens', () => {
      expect(normalizeColor('Dark Brown')).toBe('DARK-BROWN');
      expect(normalizeColor('rust / orange')).toBe('RUST-ORANGE');
      expect(normalizeColor('Off White')).toBe('OFF-WHITE');
      expect(normalizeColor('Sky Blue')).toBe('SKY-BLUE');
      expect(normalizeColor('Black')).toBe('BLACK');
    });

    it('handles punctuation and trailing slashes safely', () => {
      expect(normalizeColor(' Navy / Blue ')).toBe('NAVY-BLUE');
      expect(normalizeColor('')).toBe('');
      expect(normalizeColor(null)).toBe('');
    });
  });

  describe('ensureStyleCode', () => {
    it('preserves existing valid style code', () => {
      expect(ensureStyleCode({ existingStyleCode: 'JZ-AS-6956' })).toBe('JZ-AS-6956');
      expect(ensureStyleCode({ existingStyleCode: 'SEED-B0000006-M' })).toBe('SEED-B0000006-M');
    });

    it('generates a deterministic JZ style code if missing or UUID', () => {
      const generated = ensureStyleCode({
        existingStyleCode: 'b0000008-0000-4000-8000-000000000002',
        productName: 'Woven Tote Bag',
        productId: 'b0000001-0000-4000-8000-000000000001',
      });
      expect(generated).toMatch(/^JZ-WT-\d{4}$/);
      expect(isUuid(generated)).toBe(false);

      // Deterministic: multiple calls with same inputs yield same code
      const generatedAgain = ensureStyleCode({
        existingStyleCode: '',
        productName: 'Woven Tote Bag',
        productId: 'b0000001-0000-4000-8000-000000000001',
      });
      expect(generatedAgain).toBe(generated);
    });

    it('handles single-word product names', () => {
      const generated = ensureStyleCode({
        productName: 'Blouses',
        productId: 'b0000003-0000-4000-8000-000000000002',
      });
      expect(generated).toMatch(/^JZ-BLO-\d{4}$/);
    });
  });

  describe('buildVariantSku', () => {
    it('builds canonical variant SKU from object options', () => {
      const sku = buildVariantSku({
        styleCode: 'JZ-AS-6956',
        color: 'Dark Brown',
        size: 'Medium',
      });
      expect(sku).toBe('JZ-AS-6956-DARK-BROWN-M');
    });

    it('supports legacy positional arguments', () => {
      const sku = buildVariantSku('JZ-AS-6956', {
        color: 'Black',
        size: 'One Size',
      });
      expect(sku).toBe('JZ-AS-6956-BLACK-OS');
    });

    it('includes pattern if provided', () => {
      const sku = buildVariantSku({
        styleCode: 'JZ-DR-1234',
        color: 'Red',
        pattern: 'Floral',
        size: 'S',
      });
      expect(sku).toBe('JZ-DR-1234-RED-FLORAL-S');
    });

    it('returns null if style code is missing or a UUID', () => {
      expect(buildVariantSku({ styleCode: '', size: 'M' })).toBeNull();
      expect(buildVariantSku('b0000008-0000-4000-8000-000000000002', { size: 'M' })).toBeNull();
    });
  });

  describe('resolveVariantSku (5-step priority)', () => {
    it('Priority 1: returns valid variant_sku when present', () => {
      const item = {
        id: 'inv-uuid-1',
        productDocId: 'prod-uuid-1',
        variant_sku: 'JZ-AS-6956-BROWN-M',
        sku: 'JZ-AS-6956',
        size: 'M',
        color: 'Brown',
      };
      expect(resolveVariantSku(item)).toBe('JZ-AS-6956-BROWN-M');
    });

    it('Priority 2: returns or extends valid sku when variant_sku is absent', () => {
      const item = {
        id: 'inv-uuid-2',
        productDocId: 'prod-uuid-2',
        variant_sku: null,
        sku: 'JZ-WD-0673',
        size: 'L',
        color: 'Blue',
      };
      expect(resolveVariantSku(item)).toBe('JZ-WD-0673-BLUE-L');
    });

    it('Priority 3: resolves from parent style_code when inventory row has no valid sku', () => {
      const item = {
        id: 'a292a766-6bf1-40e5-bf60-eb6830b7050d',
        productDocId: 'prod-uuid-3',
        variant_sku: null,
        sku: '',
        size: 'Small',
        color: 'Beige',
      };
      const parentProduct = {
        id: 'prod-uuid-3',
        styleCode: 'JZ-WT-1001',
        name: 'Woven Tote Bag',
      };
      expect(resolveVariantSku(item, parentProduct)).toBe('JZ-WT-1001-BEIGE-S');
    });

    it('Priority 4: synthesizes deterministic JezSy style code when parent also lacks style_code', () => {
      const item = {
        id: 'a292a766-6bf1-40e5-bf60-eb6830b7050d',
        productDocId: 'b0000001-0000-4000-8000-000000000001',
        variant_sku: null,
        sku: 'b0000001-0000-4000-8000-000000000001', // UUID sku
        size: 'Medium',
        color: 'Beige',
      };
      const parentProduct = {
        id: 'b0000001-0000-4000-8000-000000000001',
        name: 'Woven Tote Bag',
        styleCode: '',
      };
      const resolved = resolveVariantSku(item, parentProduct);
      expect(resolved).toMatch(/^JZ-WT-\d{4}-BEIGE-M$/);
      expect(isUuid(resolved)).toBe(false);
      expect(containsUuid(resolved)).toBe(false);
    });

    it('Never outputs a database UUID', () => {
      const item = {
        id: 'a292a766-6bf1-40e5-bf60-eb6830b7050d',
        productDocId: 'b0000008-0000-4000-8000-000000000002',
        item: 'Tailored Blazer',
        variant_sku: null,
        sku: '',
        size: 'S',
        color: 'Blue',
      };
      const resolved = resolveVariantSku(item, null);
      expect(isUuid(resolved)).toBe(false);
      expect(containsUuid(resolved)).toBe(false);
      expect(resolved).toMatch(/^JZ-TB-\d{4}-BLUE-S$/);
    });

    it('Priority 5: returns "--" when there is zero product identity', () => {
      expect(resolveVariantSku(null)).toBe('--');
      expect(resolveVariantSku({})).toBe('--');
    });
  });
});
