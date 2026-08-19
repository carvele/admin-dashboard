/**
 * Tests for reviewService.js
 *
 * Verifies that getProductReviews and getAllReviews return the exact same
 * canonical Review shape: { id, text, rating, date, userName, displayName, verifiedPurchase, images, productId, ... }
 */

const mockSelectData = { data: [], error: null, count: 0 };

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn((_cols, options) => {
        const queryObj = {
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          range: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          then: (resolve) =>
            resolve({
              data: mockSelectData.data,
              error: mockSelectData.error,
              count: options?.count ? mockSelectData.count : undefined,
            }),
        };
        return queryObj;
      }),
      delete: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

import { getProductReviews, getAllReviews, deleteReview } from './reviewService';

describe('reviewService', () => {
  beforeEach(() => {
    mockSelectData.data = [];
    mockSelectData.error = null;
    mockSelectData.count = 0;
  });

  const rawRow = {
    id: 'rev-123',
    product_id: 'prod-abc',
    user_id: 'user-xyz',
    rating: 5,
    comment: 'Great fit and quality!',
    images: ['https://example.com/img1.jpg'],
    verified_purchase: true,
    created_at: '2026-08-19T10:00:00Z',
    profiles: {
      first_name: 'Maria',
      last_name: 'Clara',
      email: 'maria@example.com',
    },
  };

  test('getProductReviews returns normalized Review shape', async () => {
    mockSelectData.data = [rawRow];

    const reviews = await getProductReviews('prod-abc');
    expect(reviews).toHaveLength(1);

    const r = reviews[0];
    expect(r.id).toBe('rev-123');
    expect(r.text).toBe('Great fit and quality!');
    expect(r.rating).toBe(5);
    expect(r.userName).toBe('Maria Clara');
    expect(r.displayName).toBe('Maria Clara');
    expect(r.verifiedPurchase).toBe(true);
    expect(r.images).toEqual(['https://example.com/img1.jpg']);
    expect(r.productId).toBe('prod-abc');
    expect(r.date).toBe('2026-08-19T10:00:00Z');
  });

  test('getAllReviews returns normalized Review shape with productName', async () => {
    mockSelectData.data = [
      {
        ...rawRow,
        products: { name: 'Filipiniana Gown' },
      },
    ];
    mockSelectData.count = 1;

    const { reviews, count } = await getAllReviews(1, 20);
    expect(count).toBe(1);
    expect(reviews).toHaveLength(1);

    const r = reviews[0];
    expect(r.id).toBe('rev-123');
    expect(r.text).toBe('Great fit and quality!');
    expect(r.productName).toBe('Filipiniana Gown');
    expect(r.userName).toBe('Maria Clara');
    expect(r.displayName).toBe('Maria Clara');
    expect(r.verifiedPurchase).toBe(true);
  });

  test('handles missing profile gracefully with "Guest Explorer"', async () => {
    mockSelectData.data = [
      {
        ...rawRow,
        profiles: null,
      },
    ];

    const reviews = await getProductReviews('prod-abc');
    expect(reviews[0].userName).toBe('Guest Explorer');
    expect(reviews[0].displayName).toBe('Guest Explorer');
  });

  test('deleteReview executes without error', async () => {
    await expect(deleteReview('rev-123')).resolves.toBeUndefined();
  });
});
