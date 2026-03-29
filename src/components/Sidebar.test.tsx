// removed React import
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import '@testing-library/jest-dom';

// Mock AuthContext
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User' },
    isAdminUnlocked: true,
  }),
}));

// Mock Firestore
jest.mock('../firebase/firestore', () => ({
  subscribeToCollection: jest.fn(() => jest.fn()), // Returns unsub function
}));

describe('Sidebar Component', () => {
  it('renders branding and user info', () => {
    render(
      <BrowserRouter>
        <Sidebar isOpen={true} onClose={() => {}} />
      </BrowserRouter>,
    );
    expect(screen.getByText('JezSy Collection')).toBeInTheDocument();
  });
});
