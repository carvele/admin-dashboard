import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ActivityLog from './ActivityLog';
import '@testing-library/jest-dom';

const mockLogs = [
  {
    id: 'log-1',
    action: 'Restocked inventory item',
    userId: 'u-1',
    userName: 'Jhosu Bautista',
    targetType: 'product',
    targetId: 'prod-9',
    timestamp: new Date().toISOString(), // today
    details: { itemName: 'Ivory Gown', size: 'M', color: 'Red', qtyAdded: 8, qtyBefore: 4, qtyAfter: 12 },
  },
  {
    id: 'log-2',
    action: 'Archived staff member',
    userId: 'u-2',
    userName: 'Ms Jholy',
    targetType: 'profile',
    targetId: 'staff-3',
    timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), // 2 days ago
    details: {},
  },
];

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u-1', name: 'Jhosu Bautista', role: 'owner' } }),
}));

jest.mock('../../utils/permissions', () => ({
  can: () => true,
}));

jest.mock('../../lib/supabaseService', () => ({
  getPaginatedLogs: jest.fn(() => Promise.resolve({ rows: mockLogs, total: 2 })),
}));

jest.mock('../../services/staffService', () => ({
  getStaffMembers: jest.fn(() => Promise.resolve([
    { docId: 'u-1', name: 'Jhosu Bautista', email: 'j@example.com' },
  ])),
}));

const renderComponent = (initialEntries = ['/activity-log']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <ActivityLog />
    </MemoryRouter>,
  );

describe('ActivityLog', () => {
  it('renders a readable sentence instead of a raw JSON dump', async () => {
    renderComponent();

    expect(await screen.findByText('Ivory Gown')).toBeInTheDocument();
    expect(screen.getByText('Restocked inventory item')).toBeInTheDocument();
    // before -> after, sourced from qtyBefore/qtyAfter
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('separates entries into calendar-day groups', async () => {
    renderComponent();

    // Today's group, plus a second group headed by the older entry's weekday.
    expect(await screen.findByText('Today')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(2);
    expect(headings[1]).not.toHaveTextContent('Today');

    // Relative timestamp on the older row.
    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  it('shows the total count badge', async () => {
    renderComponent();
    expect(await screen.findByText('2 recorded')).toBeInTheDocument();
  });

  it('renders contextual target links for products and staff', async () => {
    renderComponent();
    expect(await screen.findByText('View Product')).toBeInTheDocument();
    expect(screen.getByText('View Profile')).toBeInTheDocument();
  });

  it('opens a details drawer with summary card, item details, and raw data toggle', async () => {
    renderComponent();

    fireEvent.click(await screen.findByRole('button', { name: /Restocked inventory item/i }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Performed by')).toBeInTheDocument();
    expect(within(drawer).getByText('prod-9')).toBeInTheDocument();
    expect(within(drawer).getByText('Item & Action Details')).toBeInTheDocument();
    expect(within(drawer).getByText('Red')).toBeInTheDocument();

    // Raw JSON is not shown until asked for — but it is still available.
    expect(within(drawer).queryByText(/"qtyAdded": 8/)).not.toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('button', { name: /view raw data/i }));
    expect(within(drawer).getByText(/"qtyAdded": 8/)).toBeInTheDocument();
  });

  it('closes the drawer on Escape', async () => {
    renderComponent();
    fireEvent.click(await screen.findByRole('button', { name: /Restocked inventory item/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers Clear filters only once a filter is active', async () => {
    renderComponent();
    await screen.findByText('Ivory Gown');

    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'product' } });
    expect(await screen.findByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('initializes filters from URL search params for deep-linking', async () => {
    renderComponent(['/activity-log?targetType=product&targetId=prod-9']);
    expect(await screen.findByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });
});
