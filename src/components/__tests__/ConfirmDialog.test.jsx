import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfirmDialog from '../ConfirmDialog';

describe('ConfirmDialog Component', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Confirm Deletion',
    message: 'Are you sure you want to remove this item?',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog title, message, and action buttons when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to remove this item?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('triggers onConfirm when confirm button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when cancel or close button is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Close dialog'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(2);
  });

  it('renders consequence items when provided', () => {
    const consequences = [
      'Inventory will be permanently adjusted',
      'Pending reservations will be cancelled',
    ];
    render(<ConfirmDialog {...defaultProps} consequences={consequences} />);

    expect(screen.getByText('Impact Summary:')).toBeInTheDocument();
    expect(screen.getByText('Inventory will be permanently adjusted')).toBeInTheDocument();
    expect(screen.getByText('Pending reservations will be cancelled')).toBeInTheDocument();
  });

  it('enforces typed keyword confirmation when confirmKeyword is specified', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        severity="HIGH"
        confirmKeyword="DELETE"
      />
    );

    expect(screen.getByText('Irreversible Action')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: 'Delete' });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByPlaceholderText('Type "DELETE" to confirm');
    expect(input).toBeInTheDocument();

    // Type incorrect keyword
    fireEvent.change(input, { target: { value: 'DEL' } });
    expect(confirmBtn).toBeDisabled();

    // Type exact keyword
    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('locks actions and shows loading indicator when isLoading is true', () => {
    render(<ConfirmDialog {...defaultProps} isLoading={true} />);

    const confirmBtn = screen.getByRole('button', { name: 'Processing...' });
    expect(confirmBtn).toBeDisabled();

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelBtn).toBeDisabled();

    const closeBtn = screen.getByLabelText('Close dialog');
    expect(closeBtn).toBeDisabled();

    // Escape should not trigger cancel while loading
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).not.toHaveBeenCalled();
  });
});
