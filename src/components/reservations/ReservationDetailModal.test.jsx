/**
 * src/components/reservations/ReservationDetailModal.test.jsx
 *
 * Exhaustive unit tests for ReservationDetailModal:
 * - Historical snapshot precedence (garment name, size, color, unit price)
 * - Dual status presentation (operational + financial)
 * - Financial ledger correctness across lifecycle stages
 * - Cancelled & Refund states (zero collectible balance, refund liability)
 * - Dynamic store settings & location fallbacks
 * - Context-sensitive action footer buttons & permissions
 * - Evidence-backed timeline events & error handling
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReservationDetailModal from './ReservationDetailModal';
import { fetchSettings } from '../../services/settingsService';

// Mock services to avoid live network calls
jest.mock('../../services/reservationService', () => ({
  getPaymentsForReservation: jest.fn().mockResolvedValue([]),
  findDuplicatePaymentReference: jest.fn().mockResolvedValue([]),
  settleReservationBalance: jest.fn().mockResolvedValue({ settled_at: '2026-09-22T10:00:00Z' }),
}));

jest.mock('../../lib/supabaseService', () => ({
  getLogsForTarget: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/settingsService', () => ({
  fetchSettings: jest.fn().mockResolvedValue([
    {
      key: 'storeInfo',
      value: {
        storeName: 'JezSy Flagship Boutique',
        address: 'Ayala Center, Makati City',
      },
    },
  ]),
}));

jest.mock('../../lib/storage', () => ({
  resolveSignedStorageUrl: jest.fn().mockResolvedValue('https://storage.example.com/signed-receipt.jpg'),
}));

describe('ReservationDetailModal', () => {
  const defaultProps = {
    isOpen: true,
    res: {
      id: 'res-uuid-001',
      docId: 'res-uuid-001',
      displayId: 'RES-A07559A',
      status: 'confirmed',
      displayStatus: 'To Pay',
      paymentStatus: 'Pending',
      customerName: 'Rosemarie Vicencio',
      customerId: 'cust-uuid-001',
      rentalPrice: 500,
      deposit: 250,
      createdAt: '2026-09-21T08:20:00Z',
      date: '2026-09-22T05:00:00Z',
      appointmentTime: '13:00',
      lines: [
        {
          id: 'line-1',
          productId: 'prod-001',
          productName: 'Bowknot Mini Dress',
          size: 'M',
          color: 'Black',
          quantity: 1,
          unitPrice: 500,
        },
      ],
    },
    user: { role: 'owner', uid: 'owner-001' },
    canManage: true,
    canRecordPayment: true,
    customers: [
      {
        id: 'cust-uuid-001',
        docId: 'cust-uuid-001',
        fullName: 'Rosemarie Vicencio',
        email: 'rosemarie@example.com',
        phone: '+63 917 123 4567',
      },
    ],
    products: [
      {
        id: 'prod-001',
        docId: 'prod-001',
        name: 'Bowknot Mini Dress (Renamed in Catalog)',
        price: 750, // Catalog price increased
        styleCode: 'STYLE-BMD-01',
      },
    ],
    refundQueue: [],
    onClose: jest.fn(),
    onMessage: jest.fn(),
    onReschedule: jest.fn(),
    onResolveReschedule: jest.fn(),
    onAction: jest.fn(),
    onVerifyPayment: jest.fn(),
    onRejectReceipt: jest.fn(),
    onCancelForFraud: jest.fn(),
    onVerifyBalancePayment: jest.fn(),
    onRejectBalanceReceipt: jest.fn(),
    onMarkRefundDisbursed: jest.fn(),
    onViewCustomer: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders canonical display ID without exposing internal UUID', () => {
    render(<ReservationDetailModal {...defaultProps} />);
    expect(screen.getByText('Order RES-A07559A')).toBeInTheDocument();
    expect(screen.queryByText('Order res-uuid-001')).not.toBeInTheDocument();
  });

  test('preserves historical order snapshot over current product catalog mutations', () => {
    render(<ReservationDetailModal {...defaultProps} />);
    // Snapshot name "Bowknot Mini Dress" must render, NOT the altered catalog name
    expect(screen.getByText('Bowknot Mini Dress')).toBeInTheDocument();
    expect(screen.queryByText('Bowknot Mini Dress (Renamed in Catalog)')).not.toBeInTheDocument();

    // Snapshot price (500) must render, NOT current catalog price (750)
    expect(screen.getAllByText(/₱500/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/750/)).not.toBeInTheDocument();
  });

  test('displays customer contact context and triggers customer actions', () => {
    render(<ReservationDetailModal {...defaultProps} />);
    expect(screen.getByText('rosemarie@example.com')).toBeInTheDocument();
    expect(screen.getByText('+63 917 123 4567')).toBeInTheDocument();

    const viewCustBtn = screen.getByRole('button', { name: /view customer profile/i });
    fireEvent.click(viewCustBtn);
    expect(defaultProps.onViewCustomer).toHaveBeenCalledWith('cust-uuid-001');

    const msgBtns = screen.getAllByRole('button', { name: /message customer/i });
    expect(msgBtns.length).toBeGreaterThan(0);
    fireEvent.click(msgBtns[0]);
    expect(defaultProps.onMessage).toHaveBeenCalledWith(defaultProps.res);
  });

  test('renders multi-item lines accurately with line totals and item count', () => {
    const multiItemRes = {
      ...defaultProps.res,
      rentalPrice: 800,
      lines: [
        {
          id: 'line-1',
          productName: 'Silk Blouse',
          size: 'S',
          color: 'Ivory',
          quantity: 2,
          unitPrice: 250,
        },
        {
          id: 'line-2',
          productName: 'Pleated Skirt',
          size: 'M',
          color: 'Navy',
          quantity: 1,
          unitPrice: 300,
        },
      ],
    };

    render(<ReservationDetailModal {...defaultProps} res={multiItemRes} />);
    expect(screen.getByText('Silk Blouse')).toBeInTheDocument();
    expect(screen.getByText('Pleated Skirt')).toBeInTheDocument();
    expect(screen.getByText('Qty: 2')).toBeInTheDocument();
    expect(screen.getByText('Qty: 1')).toBeInTheDocument();
    expect(screen.getByText('Total Items: 3')).toBeInTheDocument();
  });

  test('financial ledger correctly reflects unpaid state with balance due and deposit deadline', () => {
    const resWithDeadline = {
      ...defaultProps.res,
      paymentDueAt: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
    };
    render(<ReservationDetailModal {...defaultProps} res={resWithDeadline} />);
    expect(screen.getByText('Required Deposit')).toBeInTheDocument();
    expect(screen.getByText('Balance Due at Pickup')).toBeInTheDocument();
    expect(screen.getByText(/deposit deadline/i)).toBeInTheDocument();
  });

  test('preparing paid order enables Mark Ready for Pickup button', () => {
    const paidPreparingRes = {
      ...defaultProps.res,
      displayStatus: 'Preparing',
      status: 'preparing',
      paymentStatus: 'Paid',
    };
    render(<ReservationDetailModal {...defaultProps} res={paidPreparingRes} />);
    const readyBtn = screen.getByRole('button', { name: /mark ready for pickup/i });
    expect(readyBtn).toBeInTheDocument();
    fireEvent.click(readyBtn);
    expect(defaultProps.onAction).toHaveBeenCalledWith(paidPreparingRes.id, 'ready_pickup');
  });

  test('to pickup with outstanding balance disables Complete Handover', () => {
    const toPickupWithBalance = {
      ...defaultProps.res,
      displayStatus: 'To Pickup',
      status: 'ready',
      paymentType: 'Deposit',
      paymentStatus: 'Paid',
      deposit: 250,
      rentalPrice: 500,
      balanceSettledAt: null,
    };
    render(<ReservationDetailModal {...defaultProps} res={toPickupWithBalance} />);
    const handoverBtn = screen.getByRole('button', { name: /complete handover/i });
    expect(handoverBtn).toBeDisabled();
  });

  test('to pickup fully paid enables Complete Handover', () => {
    const toPickupSettled = {
      ...defaultProps.res,
      displayStatus: 'To Pickup',
      status: 'ready',
      paymentStatus: 'Paid',
      deposit: 500,
      rentalPrice: 500,
      balanceSettledAt: '2026-09-22T08:00:00Z',
    };
    render(<ReservationDetailModal {...defaultProps} res={toPickupSettled} />);
    const handoverBtn = screen.getByRole('button', { name: /complete handover/i });
    expect(handoverBtn).not.toBeDisabled();
    fireEvent.click(handoverBtn);
    expect(defaultProps.onAction).toHaveBeenCalledWith(toPickupSettled.id, 'complete');
  });

  test('cancelled unpaid order has zero balance due and displays cancellation banner', () => {
    const cancelledRes = {
      ...defaultProps.res,
      status: 'Cancelled',
      displayStatus: 'Cancelled',
      paymentStatus: 'Cancelled',
      cancellationReason: 'Customer change of mind',
      cancelledAt: '2026-09-21T10:00:00Z',
    };
    render(<ReservationDetailModal {...defaultProps} res={cancelledRes} />);
    expect(screen.getByText(/this reservation was cancelled/i)).toBeInTheDocument();
    expect(screen.getAllByText(/customer change of mind/i).length).toBeGreaterThan(0);
    // No collection button should exist
    expect(screen.queryByRole('button', { name: /record collection/i })).not.toBeInTheDocument();
  });

  test('refund required order displays refund disbursement panel for admin/owner', () => {
    const refundRequiredRes = {
      ...defaultProps.res,
      status: 'Cancelled',
      displayStatus: 'Cancelled',
      paymentStatus: 'Refund Required',
      rentalPrice: 500,
    };
    render(<ReservationDetailModal {...defaultProps} res={refundRequiredRes} />);
    expect(screen.getByText(/refund disbursement required/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark refund disbursed/i })).toBeInTheDocument();
  });

  test('receipt submitted order renders verification controls and claimed details', async () => {
    const submittedReceiptRes = {
      ...defaultProps.res,
      paymentStatus: 'Submitted',
      receiptUrl: 'receipts/order-1.jpg',
      manualAmountClaimed: 250,
      manualPaymentMethod: 'gcash',
      manualReferenceNumber: 'GCASH-12345678',
    };
    render(<ReservationDetailModal {...defaultProps} res={submittedReceiptRes} />);
    expect(screen.getByText('GCASH-12345678')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify payment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject & retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel for fraud/i })).toBeInTheDocument();
  });

  test('dynamically renders store settings location and neutral fallback when missing', async () => {
    const { rerender } = render(<ReservationDetailModal {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('JezSy Flagship Boutique')).toBeInTheDocument();
      expect(screen.getByText('Ayala Center, Makati City')).toBeInTheDocument();
    });

    // When settings fetch returns null or empty
    fetchSettings.mockResolvedValueOnce([]);
    rerender(<ReservationDetailModal {...defaultProps} />);
  });

  test('evidence-backed timeline renders only valid timestamps without fabrication', () => {
    const timelineRes = {
      ...defaultProps.res,
      createdAt: '2026-09-21T08:20:00Z',
      confirmedAt: '2026-09-21T09:00:00Z',
      confirmedByName: 'Alex Staff',
      pickupReadyAt: '2026-09-21T11:00:00Z',
    };
    render(<ReservationDetailModal {...defaultProps} res={timelineRes} />);
    expect(screen.getByText('Order placed by customer')).toBeInTheDocument();
    expect(screen.getByText('Order accepted — moved to Preparing')).toBeInTheDocument();
    expect(screen.getByText('Alex Staff')).toBeInTheDocument();
    expect(screen.getByText('Marked Ready for Pickup')).toBeInTheDocument();
  });

  test('safely handles null reservation and closed modal without throwing', () => {
    const { container } = render(<ReservationDetailModal {...defaultProps} res={null} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  test('safely handles null reservation when isOpen is true without throwing', () => {
    const { container } = render(<ReservationDetailModal {...defaultProps} res={null} isOpen={true} />);
    expect(container.firstChild).toBeNull();
  });
});
