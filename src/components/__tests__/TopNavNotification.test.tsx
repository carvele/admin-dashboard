import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import TopNav from '../TopNav';
import { subscribeToCollection } from '../../lib/supabaseService';
import { supabase } from '../../lib/supabaseClient';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ logout: jest.fn() }),
}));

jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: jest.fn() }),
}));

jest.mock('../../hooks/useRealtimeSync', () => ({
  useRealtimeSync: jest.fn(),
}));

jest.mock('../../lib/supabaseService', () => ({
  subscribeToCollection: jest.fn(),
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

describe('TopNav Notification System (NOTIF-STATE-001, NOTIF-SEC-001, NOTIF-NAV-001)', () => {
  const mockUser = {
    id: 'staff-1',
    name: 'Staff Member',
    email: 'staff@jezsy.com',
    role: 'staff',
  };

  let subscriptionCallback: (data: any[]) => void;

  beforeEach(() => {
    jest.clearAllMocks();

    (subscribeToCollection as jest.Mock).mockImplementation((_collection, callback, _query, _desc, _listenTable) => {
      subscriptionCallback = callback;
      return jest.fn(); // unsubscribe
    });

    (supabase.rpc as jest.Mock).mockImplementation((fnName: string) => {
      if (fnName === 'get_unread_notification_count') {
        return Promise.resolve({ data: 1, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  test('subscribes to admin_user_notifications_view with admin_notification_receipts listen table and queries unread count', async () => {
    render(<TopNav user={mockUser} onHamburger={jest.fn()} />);

    expect(subscribeToCollection).toHaveBeenCalledWith(
      'admin_user_notifications_view',
      expect.any(Function),
      {},
      false,
      'admin_notification_receipts',
      expect.objectContaining({ limit: 20 })
    );

    // Send mock notification
    act(() => {
      subscriptionCallback([
        {
          id: 'receipt-1',
          notification_id: 'notif-1',
          title: 'New Reservation',
          message: 'A customer reserved a dress',
          is_read: false,
          is_dismissed: false,
          entity_type: 'reservation',
          entity_id: 'res-123',
          created_at: new Date().toISOString(),
        },
      ]);
    });

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('get_unread_notification_count');
    });

    // Unread count badge should appear
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('clicking notification marks as read via RPC and navigates to entity route', async () => {
    render(<TopNav user={mockUser} onHamburger={jest.fn()} />);

    // Feed notification
    act(() => {
      subscriptionCallback([
        {
          id: 'receipt-1',
          notification_id: 'notif-1',
          title: 'New Reservation',
          message: 'A customer reserved a dress',
          is_read: false,
          is_dismissed: false,
          entity_type: 'reservation',
          entity_id: 'res-123',
          created_at: new Date().toISOString(),
        },
      ]);
    });

    // Open notifications popover
    const bellBtn = screen.getByLabelText('Toggle notifications');
    fireEvent.click(bellBtn);

    // Find and click the notification card
    const notifItem = await screen.findByText(/New Reservation/i);
    fireEvent.click(notifItem);

    // Verifies RPC was called with receipt ID
    expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_notifications_read', {
      p_receipt_ids: ['receipt-1'],
    });

    // Verifies targeted route navigation
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/reservations/res-123');
    });
  });

  test('dismissing notification calls dismiss_admin_notifications RPC', async () => {
    render(<TopNav user={mockUser} onHamburger={jest.fn()} />);

    act(() => {
      subscriptionCallback([
        {
          id: 'receipt-2',
          notification_id: 'notif-2',
          title: 'New Message',
          message: 'Hello staff',
          is_read: true,
          is_dismissed: false,
          entity_type: 'message',
          entity_id: 'conv-456',
          created_at: new Date().toISOString(),
        },
      ]);
    });

    const bellBtn = screen.getByLabelText('Toggle notifications');
    fireEvent.click(bellBtn);

    const dismissBtn = await screen.findByTitle('Dismiss notification');
    fireEvent.click(dismissBtn);

    expect(supabase.rpc).toHaveBeenCalledWith('dismiss_admin_notifications', {
      p_receipt_ids: ['receipt-2'],
    });
  });

  test('clicking "Mark all read" calls mark_admin_notifications_read with p_receipt_ids: null', async () => {
    render(<TopNav user={mockUser} onHamburger={jest.fn()} />);

    act(() => {
      subscriptionCallback([
        {
          id: 'receipt-1',
          notification_id: 'notif-1',
          title: 'New Reservation',
          message: 'A customer reserved a dress',
          is_read: false,
          is_dismissed: false,
          entity_type: 'reservation',
          entity_id: 'res-123',
          created_at: new Date().toISOString(),
        },
      ]);
    });

    const bellBtn = screen.getByLabelText('Toggle notifications');
    fireEvent.click(bellBtn);

    const markAllReadBtn = await screen.findByRole('button', { name: /mark all read/i });
    fireEvent.click(markAllReadBtn);

    expect(supabase.rpc).toHaveBeenCalledWith('mark_admin_notifications_read', {
      p_receipt_ids: null,
    });
  });

  test('clicking "Clear all" calls dismiss_admin_notifications with p_receipt_ids: null', async () => {
    (supabase.rpc as jest.Mock).mockImplementation((fnName: string) => {
      if (fnName === 'get_unread_notification_count') {
        return Promise.resolve({ data: 0, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    render(<TopNav user={mockUser} onHamburger={jest.fn()} />);

    act(() => {
      subscriptionCallback([
        {
          id: 'receipt-1',
          notification_id: 'notif-1',
          title: 'New Reservation',
          message: 'A customer reserved a dress',
          is_read: true,
          is_dismissed: false,
          entity_type: 'reservation',
          entity_id: 'res-123',
          created_at: new Date().toISOString(),
        },
      ]);
    });

    const bellBtn = screen.getByLabelText('Toggle notifications');
    fireEvent.click(bellBtn);

    const clearAllBtn = await screen.findByRole('button', { name: /clear all/i });
    fireEvent.click(clearAllBtn);

    expect(supabase.rpc).toHaveBeenCalledWith('dismiss_admin_notifications', {
      p_receipt_ids: null,
    });
  });
});
