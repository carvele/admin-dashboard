import { validateForm, productRules, sanitizeText } from '../utils/validation';

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
