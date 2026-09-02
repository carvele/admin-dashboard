// removed React import
// @ts-ignore
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import '@testing-library/jest-dom';

// Mock Services
jest.mock('../../services/reservationService', () => ({
  subscribeToReservations: jest.fn(() => jest.fn()),
  autoCancelExpiredReservations: jest.fn().mockResolvedValue(undefined), getReservations: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../services/customerService', () => ({
  subscribeToCustomers: jest.fn(() => jest.fn()),
  getCustomers: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../services/productService', () => ({
  subscribeToInventory: jest.fn(() => jest.fn()),
  getInventory: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../services/wardrobeService', () => ({
  subscribeToSuggestedOutfits: jest.fn(() => jest.fn()),
  subscribeToARSessions: jest.fn(() => jest.fn()),
  getARSessions: jest.fn(() => Promise.resolve([])),
  getSuggestedOutfits: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'admin@jezsy.com' },
    role: 'owner',
  }),
}));
// Every other realtime subscription above is mocked at the service-layer
// call site, but useRealtimeSync opens its own supabase.channel(...)
// directly rather than going through a mockable service function. Left
// unmocked, it tries to open a real websocket connection in the Node test
// environment, which never resolves and spirals into a RangeError: Maximum
// call stack size exceeded deep inside @supabase/realtime-js, crashing the
// whole Jest worker rather than just this test.
jest.mock('../../hooks/useRealtimeSync', () => ({
  useRealtimeSync: jest.fn(),
}));

// Mock Recharts to avoid ResizeObserver issues
jest.mock('recharts', () => {
  const Original = jest.requireActual('recharts');
  return {
    ...Original,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  };
});

describe('Dashboard Component', () => {
  it('renders the Dashboard overview header and metrics', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
    expect(screen.getByText('Total Reservations')).toBeInTheDocument();
    expect(screen.getByText('Active Customers')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/Live from DB/i).length).toBeGreaterThan(0);
    });
  });
});
