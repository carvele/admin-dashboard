import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import '@testing-library/jest-dom';
import * as dashboardService from '../../services/dashboardService';
import * as analyticsService from '../../services/analyticsService';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    channel: jest.fn(),
  },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'owner@jezsy.com', role: 'owner' },
    isAdminUnlocked: true,
  }),
}));

jest.mock('../../hooks/useRealtimeSync', () => ({
  useRealtimeSync: jest.fn(),
}));

jest.mock('../../services/dashboardService');
jest.mock('../../services/analyticsService');

const mockOpsData = {
  business_date: '2026-09-15',
  timezone: 'Asia/Manila',
  action_queues: {
    unique_action_count: 3,
    preparing: 1,
    awaiting_payment: 0,
    receipt_review: 0,
    ready_for_pickup: 0,
    refund_required: 2,
  },
  pending_refund_liability: {
    amount: 3180,
    count: 2,
    reservation_ids: ['RES-1', 'RES-2'],
  },
  today_schedule: [
    {
      id: 'res-1',
      reservation_code: 'RES-001',
      customer_name: 'Maria Santos',
      customer_phone: '09171234567',
      status: 'Completed',
      pickup_time: '14:00',
      total_amount: 1500,
    },
  ],
};

const mockInvHealth = {
  total_variants: 100,
  in_stock: 80,
  low_stock: 15,
  out_of_stock: 5,
};

const mockInvAlerts = [
  {
    inventory_id: 'inv-1',
    sku: 'DRS-RED-S',
    product_name: 'Red Evening Dress',
    size: 'S',
    color: 'Red',
    available: 0,
    total: 5,
    stock_tier: 'out_of_stock',
  },
];

const mockSnapshot = {
  gross_cash_collected: 45000,
  completed_booking_value: 40000,
  completed_bookings_count: 25,
  unique_customers_served: 20,
  cancellation_rate: 4.5,
  returning_customer_rate: 30.0,
  average_product_rating: 4.8,
  pending_refund_liability: {
    amount: 3180,
    count: 2,
  },
};

const mockSignups = [
  {
    id: 'user-1',
    full_name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    created_at: '2026-09-15T02:00:00Z',
  },
];

const mockLogs = [
  {
    id: 'log-1',
    created_at: '2026-09-15T04:00:00Z',
    action: 'status_update',
    target_type: 'reservation',
    target_id: 'RES-001',
    details: { old_status: 'Preparing', new_status: 'To Pickup' },
    actor: { email: 'staff@jezsy.com', role: 'staff' },
  },
];

describe('Dashboard Mission Control Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (dashboardService.getDashboardOperations as jest.Mock).mockResolvedValue(mockOpsData);
    (dashboardService.getTopInventoryAlerts as jest.Mock).mockResolvedValue(mockInvAlerts);
    (dashboardService.getRecentSignups as jest.Mock).mockResolvedValue(mockSignups);
    (dashboardService.getRecentDashboardActivity as jest.Mock).mockResolvedValue(mockLogs);
    (dashboardService.deriveMtdDateRange as jest.Mock).mockReturnValue({
      startDateStr: '2026-09-01',
      endDateStr: '2026-09-16',
      timezone: 'Asia/Manila',
    });
    (analyticsService.getInventoryHealthAnalytics as jest.Mock).mockResolvedValue(mockInvHealth);
    (analyticsService.getAnalyticsOverview as jest.Mock).mockResolvedValue(mockSnapshot);
  });

  it('renders operational mission control headline and stat cards with live data', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    expect(screen.getByText('Operational Mission Control')).toBeInTheDocument();
    expect(screen.getByText('Action Required')).toBeInTheDocument();
    expect(screen.getByText('In Preparation')).toBeInTheDocument();
    expect(screen.getByText('Ready for Pickup')).toBeInTheDocument();
    expect(screen.getByText('Pending Refund Liability')).toBeInTheDocument();

    await waitFor(() => {
      // Top KPI checks
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText(/1 Prep/i)).toBeInTheDocument();
      expect(screen.getByText(/2 Refund/i)).toBeInTheDocument();
      expect(screen.getByText('₱3,180')).toBeInTheDocument();
      expect(screen.getByText(/2 booking\(s\) require refund/i)).toBeInTheDocument();

      // Today's schedule
      expect(screen.getByText('Maria Santos')).toBeInTheDocument();

      // Inventory attention
      expect(screen.getByText('Red Evening Dress')).toBeInTheDocument();

      // Recent signups
      expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    });
  });

  it('navigates to appropriate destinations when clicking stat cards', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Action Required')).toBeInTheDocument();
    });

    // Click Action Required
    const actionCard = screen.getByLabelText('View actionable reservations');
    fireEvent.click(actionCard);
    expect(mockNavigate).toHaveBeenCalledWith('/reservations');

    // Click In Preparation
    const prepCard = screen.getByLabelText('View preparing reservations');
    fireEvent.click(prepCard);
    expect(mockNavigate).toHaveBeenCalledWith('/reservations?status=Preparing');

    // Click Ready for Pickup
    const pickupCard = screen.getByLabelText('View ready for pickup reservations');
    fireEvent.click(pickupCard);
    expect(mockNavigate).toHaveBeenCalledWith('/reservations?status=To%20Pickup');

    // Click Pending Refund Liability
    const refundCard = screen.getByLabelText('View cancelled reservations requiring refund');
    fireEvent.click(refundCard);
    expect(mockNavigate).toHaveBeenCalledWith('/reservations?status=Cancelled');
  });

  it('handles clean zero state when there are no action items or refund liability', async () => {
    (dashboardService.getDashboardOperations as jest.Mock).mockResolvedValue({
      ...mockOpsData,
      action_queues: {
        unique_action_count: 0,
        preparing: 0,
        awaiting_payment: 0,
        receipt_review: 0,
        ready_for_pickup: 0,
        refund_required: 0,
      },
      pending_refund_liability: {
        amount: 0,
        count: 0,
        reservation_ids: [],
      },
      today_schedule: [],
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('All caught up')).toBeInTheDocument();
      expect(screen.getByText('No pending refunds')).toBeInTheDocument();
      expect(screen.getByText(/No pickups scheduled for today/i)).toBeInTheDocument();
    });
  });

  it('renders three-state error handling and allows retry', async () => {
    (dashboardService.getDashboardOperations as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);
    });

    // Reset mock to return success on retry
    (dashboardService.getDashboardOperations as jest.Mock).mockResolvedValue(mockOpsData);

    fireEvent.click(screen.getAllByText('Retry')[0]);

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    });
  });
});

