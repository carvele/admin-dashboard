/**
 * Tests for accountDeletionService.js
 */

const mockSelectData = { data: [], error: null };
const mockRpcData = { data: null, error: null };

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => {
        const queryObj = {
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          not: jest.fn().mockReturnThis(),
          then: (resolve) => resolve({ data: mockSelectData.data, error: mockSelectData.error }),
        };
        return queryObj;
      }),
    })),
    rpc: jest.fn((_name, _params) => Promise.resolve(mockRpcData)),
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: { access_token: 'mock-jwt-token' },
        },
      }),
    },
  },
}));

import {
  getPendingDeletionRequests,
  getBlockingObligations,
  rejectAccountDeletion,
} from './accountDeletionService';

describe('accountDeletionService', () => {
  beforeEach(() => {
    mockSelectData.data = [];
    mockSelectData.error = null;
    mockRpcData.data = null;
    mockRpcData.error = null;
  });

  test('getPendingDeletionRequests returns normalized list with docId and customerName', async () => {
    mockSelectData.data = [
      {
        id: 'del-req-1',
        user_id: 'usr-101',
        reason: 'No longer using the app',
        status: 'pending',
        created_at: '2026-08-15T08:00:00Z',
        profiles: {
          first_name: 'Juan',
          last_name: 'Dela Cruz',
          email: 'juan@example.com',
          phone: '+639123456789',
        },
      },
    ];

    const results = await getPendingDeletionRequests();
    expect(results).toHaveLength(1);

    const req = results[0];
    expect(req.docId).toBe('del-req-1');
    expect(req.userId).toBe('usr-101');
    expect(req.customerName).toBe('Juan Dela Cruz');
    expect(req.customerEmail).toBe('juan@example.com');
    expect(req.customerPhone).toBe('+639123456789');
    expect(req.reason).toBe('No longer using the app');
  });

  test('getPendingDeletionRequests handles missing profile gracefully', async () => {
    mockSelectData.data = [
      {
        id: 'del-req-2',
        user_id: 'usr-102',
        reason: 'Privacy concerns',
        status: 'pending',
        created_at: '2026-08-16T08:00:00Z',
        profiles: null,
      },
    ];

    const results = await getPendingDeletionRequests();
    expect(results).toHaveLength(1);
    expect(results[0].customerName).toBe('Unknown customer');
    expect(results[0].customerEmail).toBeNull();
    expect(results[0].customerPhone).toBeNull();
  });

  test('getBlockingObligations returns reservations and payments', async () => {
    mockSelectData.data = [{ id: 'res-1', display_id: 'RES-001', status: 'Pending' }];

    const obligations = await getBlockingObligations('usr-101');
    expect(obligations).toHaveProperty('reservations');
    expect(obligations).toHaveProperty('payments');
    expect(Array.isArray(obligations.reservations)).toBe(true);
    expect(Array.isArray(obligations.payments)).toBe(true);
  });

  test('rejectAccountDeletion calls RPC without throwing', async () => {
    await expect(rejectAccountDeletion('del-req-1')).resolves.toBeUndefined();
  });
});
