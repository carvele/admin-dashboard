import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Customers from './Customers';
import { getPaginatedCustomers } from '../../services/customerService';

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'staff-1', role: 'staff' } }),
}));

jest.mock('../../hooks/usePresence', () => ({
  usePresence: () => ({}),
}));

jest.mock('../../services/staffService', () => ({
  logAction: jest.fn(),
}));

jest.mock('../../lib/supabaseService', () => ({
  getLogsForTarget: jest.fn().mockResolvedValue([]),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('../../services/customerService', () => ({
  updateCustomerDetails: jest.fn(),
  setCustomerBlockState: jest.fn(),
  setCustomerArchiveState: jest.fn(),
  sendNotification: jest.fn(),
  getPaginatedCustomers: jest.fn(),
  getCustomerMeasurements: jest.fn(),
  getCustomerStatsBatch: jest.fn().mockResolvedValue({}),
  getCustomerWishlistStats: jest.fn().mockResolvedValue({}),
  ENGAGEMENT_FORMULA: 'recency + frequency + wardrobe',
}));

// Three pages of two customers each -- page indexes and ids are distinct per
// page so a duplicate id, or a fetch that keeps re-requesting page 0, is
// immediately visible in the assertions below.
const PAGES = [
  { data: [{ id: 'c-1', docId: 'c-1', name: 'Alice One', email: 'alice@example.com' }, { id: 'c-2', docId: 'c-2', name: 'Bob Two', email: 'bob@example.com' }], hasMore: true, nextPage: 1, total: 6 },
  { data: [{ id: 'c-3', docId: 'c-3', name: 'Cara Three', email: 'cara@example.com' }, { id: 'c-4', docId: 'c-4', name: 'Dan Four', email: 'dan@example.com' }], hasMore: true, nextPage: 2, total: 6 },
  { data: [{ id: 'c-5', docId: 'c-5', name: 'Eve Five', email: 'eve@example.com' }, { id: 'c-6', docId: 'c-6', name: 'Finn Six', email: 'finn@example.com' }], hasMore: false, nextPage: 3, total: 6 },
];

const renderPage = () =>
  render(
    <MemoryRouter>
      <Customers />
    </MemoryRouter>,
  );

describe('Customers pagination (CUST-001)', () => {
  beforeEach(() => {
    getPaginatedCustomers.mockReset();
    getPaginatedCustomers.mockImplementation((pageSize, page) => Promise.resolve(PAGES[page]));
  });

  test('mount fetches page 0 once', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Alice One')).toBeInTheDocument());
    expect(getPaginatedCustomers).toHaveBeenCalledTimes(1);
    expect(getPaginatedCustomers).toHaveBeenNthCalledWith(1, 20, 0);
  });

  test('Load More fetches page 1, then page 2, appending unique customers', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Alice One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Load More'));
    await waitFor(() => expect(screen.getByText('Cara Three')).toBeInTheDocument());
    expect(getPaginatedCustomers).toHaveBeenNthCalledWith(2, 20, 1);

    fireEvent.click(screen.getByText('Load More'));
    await waitFor(() => expect(screen.getByText('Eve Five')).toBeInTheDocument());
    expect(getPaginatedCustomers).toHaveBeenNthCalledWith(3, 20, 2);

    // All 6 customers present, each exactly once.
    for (const name of ['Alice One', 'Bob Two', 'Cara Three', 'Dan Four', 'Eve Five', 'Finn Six']) {
      expect(screen.getAllByText(name)).toHaveLength(1);
    }
  });

  test('exhausted pagination hides the Load More button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Alice One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Load More'));
    await waitFor(() => expect(screen.getByText('Cara Three')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Load More'));
    await waitFor(() => expect(screen.getByText('Eve Five')).toBeInTheDocument());

    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
  });
});
