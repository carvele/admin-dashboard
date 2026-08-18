/**
 * Tests for staffService's status-change RPC call site. updateStaffStatus
 * is documented as "the ONLY safe write path" for employment_status/
 * is_blocked -- a direct table write would bypass the change-note history
 * and the actor-permission checks the RPC enforces server-side. These tests
 * pin that the service layer always goes through the RPC, with the right
 * param names (the RPC signature uses target_staff_id/new_employment_status/
 * new_is_blocked/change_note -- easy to typo against the JS-side targetId/
 * newEmploymentStatus/newIsBlocked/note naming).
 */

const mockRpc = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
  },
}));

jest.mock('../lib/supabaseService', () => ({
  subscribeToCollection: jest.fn(),
  subscribeToDocument: jest.fn(),
  logAction: jest.fn(),
  toCamel: (o) => o,
}));

import { updateStaffStatus } from './staffService';

describe('updateStaffStatus', () => {
  afterEach(() => mockRpc.mockReset());

  test('calls update_staff_status with the correct param names and values', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await updateStaffStatus('staff-1', 'on_leave', false, 'Approved leave request');

    expect(mockRpc).toHaveBeenCalledWith('update_staff_status', {
      target_staff_id: 'staff-1',
      new_employment_status: 'on_leave',
      new_is_blocked: false,
      change_note: 'Approved leave request',
    });
  });

  test('passes is_blocked through independent of employment_status', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await updateStaffStatus('staff-1', null, true, 'Blocked pending investigation');

    expect(mockRpc).toHaveBeenCalledWith('update_staff_status', {
      target_staff_id: 'staff-1',
      new_employment_status: null,
      new_is_blocked: true,
      change_note: 'Blocked pending investigation',
    });
  });

  test('throws when the RPC returns an error, rather than silently succeeding', async () => {
    mockRpc.mockResolvedValue({ error: new Error('Only admins or owners can modify staff status') });

    await expect(updateStaffStatus('staff-1', 'terminated', false, 'note')).rejects.toThrow(
      'Only admins or owners can modify staff status',
    );
  });
});
