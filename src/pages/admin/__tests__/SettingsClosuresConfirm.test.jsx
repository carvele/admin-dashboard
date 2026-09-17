import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Settings from '../Settings';

const mockDeleteStoreClosure = jest.fn().mockResolvedValue({ success: true });

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u-1', email: 'owner@jezsy.com', role: 'owner' }, isAdminUnlocked: true }),
}));

jest.mock('../../../services/settingsService', () => ({
  fetchSettings: jest.fn().mockResolvedValue([]),
  fetchStoreHours: jest.fn().mockResolvedValue([]),
  fetchStoreClosures: jest.fn().mockResolvedValue([
    { id: '1', closure_date: '2026-12-25', reason: 'Christmas Day' },
  ]),
  upsertStoreHour: jest.fn().mockResolvedValue({}),
  insertStoreClosure: jest.fn().mockResolvedValue({}),
  deleteStoreClosure: (...args) => mockDeleteStoreClosure(...args),
  upsertSettings: jest.fn().mockResolvedValue({}),
  requestPasswordReset: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../lib/supabaseService', () => ({
  logAction: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

jest.mock('../../../lib/storage', () => ({
  uploadToCloudinary: jest.fn(),
}));

const MockAppVersion = () => <div data-testid="app-version-settings" />;
const MockMfa = () => <div data-testid="mfa-settings" />;
const MockLegal = () => <div data-testid="legal-management" />;

jest.mock('../../settings/AppVersionSettings', () => MockAppVersion);
jest.mock('../../settings/MfaSettings', () => MockMfa);
jest.mock('../../settings/LegalManagement', () => MockLegal);

describe('Settings Closures Confirmation Dialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('clicking Remove closure opens ConfirmDialog with consequence warning and does not delete immediately', async () => {
    render(<Settings />);

    // Switch to Store Hours tab
    const hoursTab = await screen.findByRole('button', { name: /store hours/i });
    fireEvent.click(hoursTab);

    // Verify closure is shown
    expect(await screen.findByText('2026-12-25')).toBeInTheDocument();
    expect(screen.getByText('Christmas Day')).toBeInTheDocument();

    // Click Remove button
    const removeBtn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeBtn);

    // Modal dialog must be open
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Remove Store Closure')).toBeInTheDocument();
    expect(
      screen.getByText('Boutique appointment slots for this date will become available for customer booking.')
    ).toBeInTheDocument();

    // deleteStoreClosure must NOT have been called yet
    expect(mockDeleteStoreClosure).not.toHaveBeenCalled();

    // Cancel dismissal
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mockDeleteStoreClosure).not.toHaveBeenCalled();
  });

  test('confirming Remove closure executes deletion and closes modal', async () => {
    render(<Settings />);

    const hoursTab = await screen.findByRole('button', { name: /store hours/i });
    fireEvent.click(hoursTab);

    expect(await screen.findByText('2026-12-25')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(removeBtn);

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();

    // Confirm the deletion
    const confirmBtn = screen.getByRole('button', { name: 'Remove Closure' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteStoreClosure).toHaveBeenCalledWith('2026-12-25');
    });

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});
