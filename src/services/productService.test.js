import { validateForm, productRules, sanitizeText } from '../utils/validation';

const mockRpc = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
  },
}));

import { upsertProductWithColorways } from './productService';

describe('Product Service & Validation Logic', () => {
  test('sanitizes product text input against XSS scripts', () => {
    const rawInput = '<script>alert("XSS")</script>Silk Dress';
    expect(sanitizeText(rawInput)).toBe('Silk Dress');
  });

  test('validates valid product form data', () => {
    const validData = {
      name: 'Evening Gown',
      price: 1500,
      category: 'Dresses',
      imageUrl: 'https://images.example.com/gown.jpg',
    };
    const { isValid, errors } = validateForm(validData, productRules);
    expect(isValid).toBe(true);
    expect(errors).toEqual({});
  });

  test('rejects product with missing name', () => {
    const invalidData = {
      name: '',
      price: 1500,
      category: 'Dresses',
    };
    const { isValid, errors } = validateForm(invalidData, productRules);
    expect(isValid).toBe(false);
    expect(errors.name).toBeDefined();
  });

  test('rejects negative or invalid product price', () => {
    const invalidData = {
      name: 'Suit Jacket',
      price: -50,
      category: 'Suits',
    };
    const { isValid, errors } = validateForm(invalidData, productRules);
    expect(isValid).toBe(false);
    expect(errors.price).toBeDefined();
  });

  test('validates salePrice non-negative and non-exceeding regular price', () => {
    const invalidSaleData = {
      name: 'Summer Top',
      price: 500,
      onSale: true,
      salePrice: 600,
      category: 'Tops',
    };
    const { isValid, errors } = validateForm(invalidSaleData, productRules);
    expect(isValid).toBe(false);
    expect(errors.salePrice).toBeDefined();
  });
});

describe('upsertProductWithColorways RPC Serialization', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  test('maps camelCase subCategory to canonical snake_case sub_category without sending dual keys', async () => {
    let rpcArgs = null;
    mockRpc.mockImplementation((fnName, args) => {
      rpcArgs = { fnName, args };
      return Promise.resolve({ data: { product_id: 'prod-123' }, error: null });
    });

    const productPayload = {
      id: 'prod-123',
      name: 'Linen Shirt',
      category: 'Tops',
      subCategory: 'Button-Down Shirts',
      category_id: 'sub-cat-uuid-456',
      price: 1200,
    };

    const colorwaysPayload = null;

    await upsertProductWithColorways(productPayload, colorwaysPayload);

    expect(mockRpc).toHaveBeenCalledWith('upsert_product_with_colorways', expect.any(Object));
    expect(rpcArgs.fnName).toBe('upsert_product_with_colorways');
    expect(rpcArgs.args._product_payload.category).toBe('Tops');
    expect(rpcArgs.args._product_payload.sub_category).toBe('Button-Down Shirts');
    expect(rpcArgs.args._product_payload.category_id).toBe('sub-cat-uuid-456');
    // Ensure subCategory was deleted so we don't send dual keys
    expect(rpcArgs.args._product_payload.subCategory).toBeUndefined();
  });

  test('preserves sub_category if already supplied in snake_case', async () => {
    let rpcArgs = null;
    mockRpc.mockImplementation((fnName, args) => {
      rpcArgs = { fnName, args };
      return Promise.resolve({ data: { product_id: 'prod-789' }, error: null });
    });

    const productPayload = {
      id: 'prod-789',
      name: 'Pleated Trousers',
      category: 'Bottoms',
      sub_category: 'Trousers',
      category_id: 'sub-cat-uuid-789',
      price: 1800,
    };

    await upsertProductWithColorways(productPayload, null);

    expect(rpcArgs.args._product_payload.sub_category).toBe('Trousers');
    expect(rpcArgs.args._product_payload.subCategory).toBeUndefined();
  });
});

