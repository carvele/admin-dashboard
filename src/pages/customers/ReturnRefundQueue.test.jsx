import { render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReturnRefundQueue from './ReturnRefundQueue';
import { getReturnRefundRequests } from '../../services/reservationService';

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'staff-1', role: 'owner' } }),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('./ReturnRefundDetailModal', () => {
  const MockDetailModal = () => null;
  MockDetailModal.displayName = 'MockReturnRefundDetailModal';
  return MockDetailModal;
});

jest.mock('../../services/reservationService', () => ({
  getReturnRefundRequests: jest.fn(),
}));

const MOCK_REQUEST = {
  id: 'req-1',
  status: 'submitted',
  reasonCategory: 'size_fit',
  submittedAt: '2026-09-01T08:00:00Z',
  reservations: { displayId: 'RES-4821', totalAmount: 1890 },
  customer: { fullName: 'Jane Doe', email: 'jane@example.com' },
};

describe('ReturnRefundQueue table density (UX-001)', () => {
  beforeEach(() => {
    getReturnRefundRequests.mockReset();
    getReturnRefundRequests.mockResolvedValue([MOCK_REQUEST]);
  });

  test('table has 6 columns -- Booking ID absorbs Submitted Date, Customer already carries contact', async () => {
    render(<ReturnRefundQueue />);
    await waitFor(() => expect(screen.getByText('RES-4821')).toBeInTheDocument());

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Booking ID', 'Customer', 'Reason Category', 'Photo Evidence', 'Status', 'Actions']);
    expect(headers).not.toContain('Submitted At');
  });

  test('the Booking ID cell carries the submitted date, and the Customer cell carries contact info', async () => {
    render(<ReturnRefundQueue />);
    await waitFor(() => expect(screen.getByText('RES-4821')).toBeInTheDocument());

    const row = screen.getByText('RES-4821').closest('tr');
    const bookingIdCell = row.querySelector('td');
    expect(within(bookingIdCell).getByText(/Submitted Sep/)).toBeInTheDocument();
    expect(within(row).getByText('jane@example.com')).toBeInTheDocument();
  });

  test('status visibility and review action are preserved', async () => {
    render(<ReturnRefundQueue />);
    await waitFor(() => expect(screen.getByText('RES-4821')).toBeInTheDocument());

    const row = screen.getByText('RES-4821').closest('tr');
    expect(within(row).getByText('Submitted')).toBeInTheDocument();
    expect(within(row).getByText(/Review/)).toBeInTheDocument();
  });
});
