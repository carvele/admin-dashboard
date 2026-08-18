import {
  normaliseVariant,
  variantKey,
  variantLabel,
  buildVariantSku,
  buildVariantMatrix,
  getVariantAxes,
  restockVariant,
  restockVariants,
} from './variantService';
import { adjustInventoryStockDelta } from './productService';

jest.mock('../lib/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../lib/supabaseService', () => ({
  toCamel: (row) => row,
}));

jest.mock('./productService', () => ({
  adjustInventoryStockDelta: jest.fn(),
  syncProductStock: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

describe('normaliseVariant', () => {
  it('defaults colour and pattern to empty strings for pre-migration rows', () => {
    const v = normaliseVariant({ id: 'inv-1', size: 'M', total: 4, reserved: 1, available: 3 });
    expect(v.color).toBe('');
    expect(v.pattern).toBe('');
    expect(v.docId).toBe('inv-1');
  });

  it('coerces stock numbers and survives a null row', () => {
    const v = normaliseVariant({ id: 'x', total: '7', reserved: null });
    expect(v.total).toBe(7);
    expect(v.reserved).toBe(0);
    expect(normaliseVariant(null).total).toBe(0);
  });
});

describe('variantKey / variantLabel', () => {
  it('distinguishes variants that differ only by colour', () => {
    expect(variantKey({ size: 'M', color: 'Red', pattern: 'Solid' }))
      .not.toBe(variantKey({ size: 'M', color: 'Blue', pattern: 'Solid' }));
  });

  it('does not collide when a value contains the separator characters', () => {
    expect(variantKey({ size: 'M', color: 'Red' }))
      .not.toBe(variantKey({ size: 'M', color: '', pattern: 'Red' }));
  });

  it('labels only the dimensions in use', () => {
    expect(variantLabel({ size: 'M', color: 'Red', pattern: 'Solid' })).toBe('M / Red / Solid');
    expect(variantLabel({ size: 'M' })).toBe('M');
    expect(variantLabel({})).toBe('Default');
  });
});

describe('buildVariantSku', () => {
  it('builds an uppercase dash-joined sku', () => {
    expect(buildVariantSku('gown01', { size: 'M', color: 'Red', pattern: 'Solid' }))
      .toBe('GOWN01-RED-SOLID-M');
  });

  it('skips unused dimensions and strips punctuation', () => {
    expect(buildVariantSku('GOWN01', { size: 'M' })).toBe('GOWN01-M');
    expect(buildVariantSku('GOWN01', { color: 'Off White' })).toBe('GOWN01-OFFWHITE');
  });

  it('returns null without a base sku', () => {
    expect(buildVariantSku('', { size: 'M' })).toBeNull();
    expect(buildVariantSku(null, { size: 'M' })).toBeNull();
  });
});

describe('buildVariantMatrix', () => {
  it('produces the full cross product without creating anything', () => {
    const matrix = buildVariantMatrix({ sizes: ['S', 'M'], colors: ['Red', 'Blue'], patterns: ['Solid'] });
    expect(matrix).toHaveLength(4);
    expect(matrix.every((c) => c.exists === false)).toBe(true);
  });

  it('marks combinations that already exist and carries the variant through', () => {
    const existing = [{ size: 'M', color: 'Red', pattern: 'Solid', docId: 'inv-1', total: 4 }];
    const matrix = buildVariantMatrix({ sizes: ['S', 'M'], colors: ['Red'], patterns: ['Solid'] }, existing);

    const m = matrix.find((c) => c.size === 'M');
    expect(m.exists).toBe(true);
    expect(m.variant.docId).toBe('inv-1');

    const s = matrix.find((c) => c.size === 'S');
    expect(s.exists).toBe(false);
    expect(s.variant).toBeNull();
  });

  it('handles a product that varies by size only', () => {
    const matrix = buildVariantMatrix({ sizes: ['S', 'M'], colors: [], patterns: [] });
    expect(matrix).toHaveLength(2);
    expect(matrix[0].color).toBe('');
  });
});

describe('getVariantAxes', () => {
  it('returns the distinct stocked values per dimension', () => {
    const axes = getVariantAxes([
      { size: 'M', color: 'Red', pattern: 'Solid' },
      { size: 'S', color: 'Red', pattern: '' },
    ]);
    expect(axes.sizes).toEqual(['M', 'S']);
    expect(axes.colors).toEqual(['Red']);
    expect(axes.patterns).toEqual(['Solid']);
  });
});

describe('restockVariant', () => {
  it('delegates to the atomic RPC rather than reading then writing', async () => {
    adjustInventoryStockDelta.mockResolvedValue({ prevTotal: 4, newTotal: 12 });

    const res = await restockVariant('inv-1', 8);

    expect(adjustInventoryStockDelta).toHaveBeenCalledWith('inv-1', {
      totalDelta: 8,
      availableDelta: 8,
    });
    expect(res.newTotal).toBe(12);
  });

  it('rejects a zero or non-numeric delta before hitting the server', async () => {
    await expect(restockVariant('inv-1', 0)).rejects.toThrow(/non-zero/);
    await expect(restockVariant('inv-1', 'abc')).rejects.toThrow(/non-zero/);
    await expect(restockVariant('', 5)).rejects.toThrow(/variant id/);
    expect(adjustInventoryStockDelta).not.toHaveBeenCalled();
  });

  it('allows a negative delta for corrections', async () => {
    adjustInventoryStockDelta.mockResolvedValue({ prevTotal: 4, newTotal: 2 });
    await restockVariant('inv-1', -2);
    expect(adjustInventoryStockDelta).toHaveBeenCalledWith('inv-1', {
      totalDelta: -2,
      availableDelta: -2,
    });
  });
});

describe('restockVariants', () => {
  it('reports partial success instead of aborting the batch', async () => {
    adjustInventoryStockDelta
      .mockResolvedValueOnce({ newTotal: 12 })
      .mockRejectedValueOnce(new Error('row locked'));

    const results = await restockVariants([
      { variantId: 'inv-1', qtyDelta: 8, label: 'M / Red' },
      { variantId: 'inv-2', qtyDelta: 5, label: 'M / Blue' },
    ]);

    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(results[1].error).toBe('row locked');
  });

  it('applies each restock sequentially so product sync writes cannot race', async () => {
    const order = [];
    adjustInventoryStockDelta.mockImplementation(async (id) => {
      order.push(`start-${id}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end-${id}`);
      return { newTotal: 1 };
    });

    await restockVariants([
      { variantId: 'a', qtyDelta: 1 },
      { variantId: 'b', qtyDelta: 1 },
    ]);

    expect(order).toEqual(['start-a', 'end-a', 'start-b', 'end-b']);
  });
});
