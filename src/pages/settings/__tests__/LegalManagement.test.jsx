import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LegalManagement from '../LegalManagement';
import { legalService } from '../../../services/legalService';

jest.mock('../../../services/legalService', () => ({
  legalService: {
    getDocumentHistory: jest.fn(),
    canPublishLegalDocuments: jest.fn(),
    publishLegalDocument: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('LegalManagement - Management Surface & Publishing Copy Regression', () => {
  const mockTermsHistory = [
    {
      id: 'doc-1234-5678',
      document_type: 'terms',
      version: '1.0.0',
      title: 'Terms of Service',
      content_markdown: '# Terms\n\nThese are the terms.',
      content_sha256: 'abcdef1234567890',
      is_active: true,
      is_published: true,
      created_at: '2026-09-17T00:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    legalService.getDocumentHistory.mockResolvedValue(mockTermsHistory);
    legalService.canPublishLegalDocuments.mockResolvedValue(true);
    legalService.publishLegalDocument.mockResolvedValue({ success: true });
  });

  test('loads document history and owner publishing capability on mount', async () => {
    render(<LegalManagement />);

    expect(await screen.findByText('Legal Document Management')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish new version/i })).toBeInTheDocument();

    expect(legalService.getDocumentHistory).toHaveBeenCalledWith('terms');
    expect(legalService.canPublishLegalDocuments).toHaveBeenCalled();
  });

  test('switches tabs and fetches history for privacy policy', async () => {
    legalService.getDocumentHistory.mockImplementation(async (tab) => {
      if (tab === 'privacy') {
        return [
          {
            id: 'doc-privacy-1',
            document_type: 'privacy',
            version: '1.0.0',
            title: 'Privacy Policy',
            content_markdown: '# Privacy Policy',
            content_sha256: '9876543210abcdef',
            is_active: true,
            is_published: true,
            created_at: '2026-09-17T00:00:00Z',
          },
        ];
      }
      return mockTermsHistory;
    });

    render(<LegalManagement />);
    await screen.findByText('Legal Document Management');

    fireEvent.click(screen.getByRole('button', { name: /privacy policy/i }));

    await waitFor(() => {
      expect(legalService.getDocumentHistory).toHaveBeenCalledWith('privacy');
    });
  });

  test('draft form supports markdown preview and displays customer-only consequences in ConfirmDialog', async () => {
    render(<LegalManagement />);
    await screen.findByText('Legal Document Management');

    // Open draft form
    fireEvent.click(screen.getByRole('button', { name: /publish new version/i }));
    expect(screen.getByText(/drafting new version \(terms\)/i)).toBeInTheDocument();

    // Verify draft form fields
    const titleInput = screen.getByLabelText(/document title/i);
    const versionInput = screen.getByLabelText(/version string/i);
    const contentTextarea = screen.getByLabelText(/markdown content/i);

    expect(titleInput).toHaveValue('Terms of Service');
    expect(versionInput).toHaveValue('1.1.0');

    // Update markdown content and observe live preview
    fireEvent.change(contentTextarea, { target: { value: '## Updated Terms Section' } });

    // Click submit button ('Publish Immediately for Customers')
    const submitBtn = screen.getByRole('button', { name: /publish immediately for customers/i });
    fireEvent.click(submitBtn);

    // Verify ConfirmDialog opens with customer gating consequence
    expect(await screen.findByText(/are you sure you want to publish version 1\.1\.0\?/i)).toBeInTheDocument();

    // Verify consequence copy:
    // 1. Mentions customer mobile app gating
    expect(
      screen.getByText(/all active customer mobile app sessions will be gated until explicitly reviewing and accepting the updated version\./i)
    ).toBeInTheDocument();

    // 2. Mentions Admin Dashboard remains available with NO legal acceptance gate
    expect(
      screen.getByText(/the admin dashboard remains available for authorized staff with no legal acceptance gate\./i)
    ).toBeInTheDocument();

    // 3. Stale copy claiming staff re-acceptance must NOT be present
    expect(
      screen.queryByText(/all staff members will be required to re-accept before accessing the admin dashboard/i)
    ).not.toBeInTheDocument();

    // Confirm publication
    const confirmBtn = screen.getByRole('button', { name: /publish document/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(legalService.publishLegalDocument).toHaveBeenCalledWith(
        'terms',
        '1.1.0',
        'Terms of Service',
        '## Updated Terms Section'
      );
    });
  });

  test('shows restricted banner when user cannot publish legal documents', async () => {
    legalService.canPublishLegalDocuments.mockResolvedValue(false);

    render(<LegalManagement />);
    expect(await screen.findByText(/only the boutique owner can publish new legal documents/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish new version/i })).not.toBeInTheDocument();
  });
});
