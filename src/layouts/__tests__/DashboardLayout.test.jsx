import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import DashboardLayout from '../DashboardLayout';
import { legalService } from '../../services/legalService';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../components/Sidebar', () => function MockSidebar({ isCollapsed }) {
  return <div data-testid="mock-sidebar" data-collapsed={isCollapsed} />;
});

jest.mock('../../components/TopNav', () => function MockTopNav({ user }) {
  return <div data-testid="mock-topnav">{user?.email}</div>;
});

jest.mock('../../services/legalService', () => ({
  legalService: {
    getLegalAcceptanceStatus: jest.fn(),
  },
}));

const { useAuth } = jest.requireMock('../../context/AuthContext');

describe('DashboardLayout - Legal Gate Removal Regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('redirects to /login when user is not authenticated', () => {
    useAuth.mockReturnValue({ user: null });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardLayout />} />
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(legalService.getLegalAcceptanceStatus).not.toHaveBeenCalled();
  });

  test('renders dashboard layout directly for authenticated staff without any legal gate evaluation', () => {
    useAuth.mockReturnValue({
      user: { id: 'staff-1', email: 'staff@jezsy.com', role: 'staff' },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<div data-testid="dashboard-content">Main Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Sidebar, TopNav, and main content render immediately
    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('mock-topnav')).toHaveTextContent('staff@jezsy.com');
    expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();

    // Zero legal acceptance RPC calls during startup
    expect(legalService.getLegalAcceptanceStatus).not.toHaveBeenCalled();

    // Zero legal modal or overlay in DOM
    expect(screen.queryByText(/legal acceptance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/terms of service/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/privacy policy/i)).not.toBeInTheDocument();
  });
});
