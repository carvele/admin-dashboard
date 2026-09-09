const mockFrom = jest.fn();
const mockResetPasswordForEmail = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (...args) => mockFrom(...args),
    auth: {
      resetPasswordForEmail: (...args) => mockResetPasswordForEmail(...args),
    },
  },
}));

import {
  fetchSettings,
  fetchStoreHours,
  fetchStoreClosures,
  upsertStoreHour,
  insertStoreClosure,
  deleteStoreClosure,
  upsertSettings,
  requestPasswordReset,
} from './settingsService';

describe('settingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchSettings', () => {
    test('returns settings array on success', async () => {
      const mockData = [{ key: 'boutique_name', value: 'Jezsy' }];
      mockFrom.mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: mockData, error: null }),
      });

      const result = await fetchSettings();
      expect(mockFrom).toHaveBeenCalledWith('settings');
      expect(result).toEqual(mockData);
    });

    test('throws on error', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
      });

      await expect(fetchSettings()).rejects.toThrow('DB error');
    });
  });

  describe('fetchStoreHours', () => {
    test('returns ordered store hours on success', async () => {
      const mockHours = [{ day_of_week: 1, open_time: '09:00:00', close_time: '18:00:00' }];
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockHours, error: null }),
        }),
      });

      const result = await fetchStoreHours();
      expect(mockFrom).toHaveBeenCalledWith('store_hours');
      expect(result).toEqual(mockHours);
    });

    test('throws on error', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: null, error: new Error('Failed hours') }),
        }),
      });

      await expect(fetchStoreHours()).rejects.toThrow('Failed hours');
    });
  });

  describe('fetchStoreClosures', () => {
    test('returns store closures on success', async () => {
      const mockClosures = [{ id: 'cl-1', closure_date: '2026-12-25', reason: 'Holiday' }];
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockClosures, error: null }),
        }),
      });

      const result = await fetchStoreClosures();
      expect(mockFrom).toHaveBeenCalledWith('store_closures');
      expect(result).toEqual(mockClosures);
    });

    test('throws on error', async () => {
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: null, error: new Error('Failed closures') }),
        }),
      });

      await expect(fetchStoreClosures()).rejects.toThrow('Failed closures');
    });
  });

  describe('upsertStoreHour', () => {
    test('upserts only database fields with safe defaults', async () => {
      const upsert = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert,
      });

      const payload = {
        day_of_week: 1,
        day_name: 'Monday',
        open_time: '',
        close_time: '',
        is_closed: 0,
        slot_capacity: 0,
      };
      await upsertStoreHour(payload);
      expect(mockFrom).toHaveBeenCalledWith('store_hours');
      expect(upsert).toHaveBeenCalledWith({
        day_of_week: 1,
        open_time: '09:00:00',
        close_time: '18:00:00',
        is_closed: false,
        slot_capacity: 3,
      }, { onConflict: 'day_of_week' });
    });

    test('throws on error', async () => {
      mockFrom.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: new Error('Upsert failed') }),
      });

      await expect(upsertStoreHour({})).rejects.toThrow('Upsert failed');
    });
  });

  describe('insertStoreClosure', () => {
    test('selects and returns the inserted row', async () => {
      const mockData = { id: 'cl-2', closure_date: '2026-01-01' };
      const single = jest.fn().mockResolvedValue({ data: mockData, error: null });
      const select = jest.fn().mockReturnValue({ single });
      const insert = jest.fn().mockReturnValue({ select });
      mockFrom.mockReturnValue({
        insert,
      });

      const payload = { closure_date: '2026-01-01' };
      const result = await insertStoreClosure(payload);
      expect(mockFrom).toHaveBeenCalledWith('store_closures');
      expect(insert).toHaveBeenCalledWith(payload);
      expect(select).toHaveBeenCalledWith();
      expect(single).toHaveBeenCalledWith();
      expect(result).toEqual(mockData);
    });

    test('throws on error', async () => {
      const single = jest.fn().mockResolvedValue({ data: null, error: new Error('Insert failed') });
      mockFrom.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ single }),
        }),
      });

      await expect(insertStoreClosure({})).rejects.toThrow('Insert failed');
    });
  });

  describe('deleteStoreClosure', () => {
    test('deletes closure by id', async () => {
      mockFrom.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      await deleteStoreClosure('cl-1');
      expect(mockFrom).toHaveBeenCalledWith('store_closures');
    });

    test('throws on error', async () => {
      mockFrom.mockReturnValue({
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: new Error('Delete failed') }),
        }),
      });

      await expect(deleteStoreClosure('cl-1')).rejects.toThrow('Delete failed');
    });
  });

  describe('upsertSettings', () => {
    test('calls upsert on settings table', async () => {
      const upsert = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert,
      });

      const payload = { key: 'test_key', value: 'test_val' };
      await upsertSettings(payload);
      expect(mockFrom).toHaveBeenCalledWith('settings');
      expect(upsert).toHaveBeenCalledWith(payload, { onConflict: 'key' });
    });

    test('throws on error', async () => {
      mockFrom.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: new Error('Settings upsert error') }),
      });

      await expect(upsertSettings({ key: 'k', value: 'v' })).rejects.toThrow('Settings upsert error');
    });
  });

  describe('requestPasswordReset', () => {
    test('calls supabase.auth.resetPasswordForEmail', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      await requestPasswordReset('admin@jezsy.com', 'http://localhost:5173/login');
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('admin@jezsy.com', {
        redirectTo: 'http://localhost:5173/login',
      });
    });

    test('throws on auth error', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: new Error('User not found') });

      await expect(
        requestPasswordReset('admin@jezsy.com', 'http://localhost:5173/login')
      ).rejects.toThrow('User not found');
    });
  });
});
