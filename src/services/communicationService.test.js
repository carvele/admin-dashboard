import { addReaction } from './communicationService';
import { supabase } from '../lib/supabaseClient';
import { errorReporting } from './observability';

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    storage: { from: jest.fn() },
    channel: jest.fn(),
  },
}));

jest.mock('./observability', () => ({
  errorReporting: {
    capture: jest.fn(),
  },
}));

describe('communicationService.addReaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls merge_message_reaction with exact live parameters and returns ok: true', async () => {
    supabase.rpc.mockResolvedValue({
      data: { 'staff-1': '❤️' },
      error: null,
    });

    const result = await addReaction('msg-123', '❤️');

    expect(supabase.rpc).toHaveBeenCalledWith('merge_message_reaction', {
      p_message_id: 'msg-123',
      p_emoji: '❤️',
    });
    expect(result).toEqual({
      ok: true,
      data: { 'staff-1': '❤️' },
    });
    expect(errorReporting.capture).not.toHaveBeenCalled();
  });

  test('captures error in errorReporting and returns ok: false on RPC failure', async () => {
    const mockError = new Error('RPC failure');
    supabase.rpc.mockResolvedValue({
      data: null,
      error: mockError,
    });

    const result = await addReaction('msg-123', '❤️');

    expect(supabase.rpc).toHaveBeenCalledWith('merge_message_reaction', {
      p_message_id: 'msg-123',
      p_emoji: '❤️',
    });
    expect(result).toEqual({
      ok: false,
      error: mockError,
    });
    expect(errorReporting.capture).toHaveBeenCalledWith(mockError, {
      domain: 'communication',
      operation: 'addReaction',
      context: { messageDocId: 'msg-123', emoji: '❤️' },
    });
  });
});
