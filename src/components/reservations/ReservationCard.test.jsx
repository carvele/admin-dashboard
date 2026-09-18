import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReservationCard from './ReservationCard';

const baseRes = {
  id: 'res-1',
  displayId: 'RES-001',
  displayName: 'Jane Doe',
  displayDate: new Date('2026-09-19T00:00:00Z'),
  lines: [],
};

const noop = () => {};
const renderCard = (res) =>
  render(
    <ReservationCard
      res={{ ...baseRes, ...res }}
      canManage={false}
      onView={noop}
      onAction={noop}
      onReschedule={noop}
      onMessage={noop}
      onResolveReschedule={noop}
    />,
  );

describe('ReservationCard refund presentation (RES-002)', () => {
  test('a refunded reservation reads "Refunded", not blank, even while operationally Completed', () => {
    renderCard({ displayStatus: 'Completed', paymentStatus: 'Refunded', status: 'Completed' });
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  test('a pending refund reads "Refund Required" and does not masquerade as Completed', () => {
    renderCard({ displayStatus: 'Completed', paymentStatus: 'Refund Required', status: 'Completed' });
    expect(screen.getByText('Refund Required')).toBeInTheDocument();
  });

  test('a plain paid reservation still reads "Paid in full"', () => {
    renderCard({ displayStatus: 'To Pickup', paymentStatus: 'Paid', status: 'Confirmed' });
    expect(screen.getByText('Paid in full')).toBeInTheDocument();
  });

  test('a cancelled reservation with no refund state reads "Cancelled"', () => {
    renderCard({ displayStatus: 'Cancelled', paymentStatus: 'Unpaid', status: 'Cancelled' });
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});
