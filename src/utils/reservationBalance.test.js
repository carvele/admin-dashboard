import { balanceDue, isDepositReservation, isFullySettled } from './reservationBalance';

const deposit = (over = {}) => ({
  paymentType: 'Deposit',
  paymentStatus: 'Paid',
  rentalPrice: 1890,
  deposit: 945,
  ...over,
});

describe('balanceDue', () => {
  it('is the unpaid half once a deposit has cleared', () => {
    expect(balanceDue(deposit())).toBe(945);
  });

  it('is zero when the reservation was paid in full up front', () => {
    expect(balanceDue(deposit({ paymentType: 'Full', deposit: 1890 }))).toBe(0);
  });

  // Before the deposit lands nothing has been received, so there is no
  // "balance" -- the whole price is outstanding and the payment deadline owns
  // that. Showing a balance here would imply the deposit had already arrived.
  it('is zero while the deposit is still pending', () => {
    expect(balanceDue(deposit({ paymentStatus: 'Pending' }))).toBe(0);
  });

  it('is zero for a submitted receipt that staff have not verified', () => {
    expect(balanceDue(deposit({ paymentStatus: 'Submitted' }))).toBe(0);
  });

  it('never returns a negative amount when the data is inverted', () => {
    expect(balanceDue(deposit({ deposit: 2000 }))).toBe(0);
  });

  it('rounds to centavos rather than trailing float noise', () => {
    expect(balanceDue(deposit({ rentalPrice: 165, deposit: 82.5 }))).toBe(82.5);
  });

  it('tolerates missing amounts', () => {
    expect(balanceDue(deposit({ rentalPrice: null, deposit: null }))).toBe(0);
    expect(balanceDue(null)).toBe(0);
  });

  it('matches on payment type regardless of casing', () => {
    expect(isDepositReservation({ paymentType: 'deposit' })).toBe(true);
    expect(balanceDue(deposit({ paymentStatus: 'paid' }))).toBe(945);
  });
});

describe('isFullySettled', () => {
  it('is false while a balance is outstanding', () => {
    expect(isFullySettled(deposit())).toBe(false);
  });

  it('is true for a paid-in-full reservation', () => {
    expect(isFullySettled(deposit({ paymentType: 'Full', deposit: 1890 }))).toBe(true);
  });

  it('is false when nothing has been paid at all', () => {
    expect(isFullySettled(deposit({ paymentStatus: 'Pending' }))).toBe(false);
  });
});
