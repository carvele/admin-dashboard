// removed React import
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import '@testing-library/jest-dom';

// Mock Services
jest.mock('../../services/reservationService', () => ({
  subscribeToReservations: jest.fn(() => jest.fn()),
}));
jest.mock('../../services/customerService', () => ({
  subscribeToCustomers: jest.fn(() => jest.fn()),
}));
jest.mock('../../services/productService', () => ({
  subscribeToInventory: jest.fn(() => jest.fn()),
}));
jest.mock('../../services/wardrobeService', () => ({
  subscribeToSuggestedOutfits: jest.fn(() => jest.fn()),
  subscribeToARSessions: jest.fn(() => jest.fn()),
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
  it('renders the Dashboard overview header and metrics', () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    expect(screen.getByText('Dashboard Overview')).toBeInTheDocument();
    expect(screen.getByText('Total Reservations')).toBeInTheDocument();
    expect(screen.getByText('Active Customers')).toBeInTheDocument();
  });
});
