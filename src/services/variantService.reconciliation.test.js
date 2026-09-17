import {
  normalizeVariantKey,
  reconcileProductVariants,
  syncProductAttributesFromVariants,
} from './variantService';
import { supabase } from '../lib/supabaseClient';

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('../lib/supabaseService', () => ({
  toCamel: (row) => row,
}));

jest.mock('./productService', () => ({
  adjustInventoryOnHand: jest.fn(),
  syncProductStock: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizeVariantKey', () => {
  it('normalizes size to uppercase and color to lowercase with whitespace trimmed', () => {
    expect(normalizeVariantKey({ size: '  m  ', color: '  Navy Blue ' })).toBe('M|||navy blue');
    expect(normalizeVariantKey({ size: 'xl', color: 'BLACK' })).toBe('XL|||black');
  });

  it('matches case-insensitively and regardless of surrounding spaces', () => {
    const key1 = normalizeVariantKey({ size: 's', color: 'white' });
    const key2 = normalizeVariantKey({ size: 'S ', color: ' White' });
    expect(key1).toBe(key2);
  });

  it('handles missing or empty arguments safely', () => {
    expect(normalizeVariantKey()).toBe('|||');
    expect(normalizeVariantKey({})).toBe('|||');
    expect(normalizeVariantKey({ size: 'M' })).toBe('M|||');
    expect(normalizeVariantKey({ color: 'Red' })).toBe('|||red');
  });
});

describe('reconcileProductVariants', () => {
  it('throws when productDocId is missing', async () => {
    await expect(reconcileProductVariants('')).rejects.toThrow(/requires a product id/);
    await expect(reconcileProductVariants(null)).rejects.toThrow(/requires a product id/);
  });

  it('invokes reconcile_product_variants RPC with trimmed variants and metadata', async () => {
    const mockRpcResponse = {
      success: true,
      productId: 'prod-123',
      archivedCount: 1,
      restoredCount: 1,
      createdCount: 2,
      unchangedCount: 0,
      activeColors: 'Black, White',
    };

    supabase.rpc.mockResolvedValue({ data: mockRpcResponse, error: null });

    const result = await reconcileProductVariants('prod-123', {
      productInfo: {
        name: 'Cool Jacket',
        category: 'Outerwear',
        styleCode: 'CJ-001',
      },
      desiredVariants: [
        { size: ' S ', color: ' Black ' },
        { size: 'M', color: 'White' },
      ],
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('reconcile_product_variants', {
      p_product_id: 'prod-123',
      p_desired_variants: [
        { size: 'S', color: 'Black' },
        { size: 'M', color: 'White' },
      ],
      p_product_name: 'Cool Jacket',
      p_category: 'Outerwear',
      p_style_code: 'CJ-001',
    });
    expect(result).toEqual(mockRpcResponse);
  });

  it('handles empty productInfo fields by passing null', async () => {
    supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });

    await reconcileProductVariants('prod-123', {
      desiredVariants: [],
    });

    expect(supabase.rpc).toHaveBeenCalledWith('reconcile_product_variants', {
      p_product_id: 'prod-123',
      p_desired_variants: [],
      p_product_name: null,
      p_category: null,
      p_style_code: null,
    });
  });

  it('throws if the RPC returns an error (e.g. active customer reservations)', async () => {
    const rpcError = new Error('Cannot remove variant(s) with active customer reservations: Navy / M (2 unit(s) reserved)');
    rpcError.code = 'P0001';
    supabase.rpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(
      reconcileProductVariants('prod-123', {
        desiredVariants: [{ size: 'S', color: 'Black' }],
      })
    ).rejects.toThrow(/Cannot remove variant\(s\) with active customer reservations/);
  });
});

describe('syncProductAttributesFromVariants', () => {
  it('clears color and sets base_color to null when all variants are removed or colorless', async () => {
    const mockEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    supabase.from.mockImplementation((table) => {
      if (table === 'inventory') return { select: mockSelect };
      if (table === 'products') return { update: mockUpdate };
      return {};
    });

    const updates = await syncProductAttributesFromVariants('prod-123');

    expect(updates.color).toBe('');
    expect(updates.base_color).toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        color: '',
        base_color: null,
      })
    );
  });

  it('syncs single and multi-color swatches back to product', async () => {
    const mockEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [
            { id: '1', size: 'S', color: 'Navy', deleted: false },
            { id: '2', size: 'M', color: 'Navy', deleted: false },
            { id: '3', size: 'L', color: 'Cream', deleted: false },
          ],
          error: null,
        }),
      }),
    });

    supabase.from.mockImplementation((table) => {
      if (table === 'inventory') return { select: mockSelect };
      if (table === 'products') return { update: mockUpdate };
      return {};
    });

    const updates = await syncProductAttributesFromVariants('prod-123');

    expect(updates.color).toBe('Cream, Navy');
    expect(updates.base_color).toBe('Cream');
  });
});
