/**
 * What is still owed on a reservation.
 *
 * A deposit reservation takes 50% up front and the rest in person at collection.
 * The customer app says so in as many words -- "Balance on collection" -- but
 * nothing here ever showed it: the card and the list both read `paymentStatus`,
 * which the payment webhook sets to 'Paid' as soon as the *deposit* clears. So a
 * reservation still owing half its value displayed a flat "Paid", and staff had
 * nothing on screen at handover telling them to collect the rest.
 *
 * `paymentType` already records 'Deposit' against 'Full' correctly. It just had
 * no reader. This is that reader.
 *
 * Derived, never stored: the balance is always rentalPrice - deposit, so there
 * is nothing to keep in sync and nothing to migrate.
 */

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** True when this reservation was taken on a deposit rather than paid in full. */
export const isDepositReservation = (res) =>
  String(res?.paymentType ?? '').toLowerCase() === 'deposit';

/**
 * Amount still to collect, or 0.
 *
 * Returns 0 until the deposit has actually cleared. Before that nothing has been
 * received and the whole price is outstanding, which is the payment deadline's
 * job to chase -- not a "balance", and showing one there would imply the deposit
 * had already landed.
 */
export const balanceDue = (res) => {
  if (!res || !isDepositReservation(res)) return 0;
  if (String(res.paymentStatus ?? '').toLowerCase() !== 'paid') return 0;

  const outstanding = money(res.rentalPrice) - money(res.deposit);
  // Guard the inverted case: a row where deposit exceeds the total is bad data,
  // and staff should not be told to collect a negative amount.
  return outstanding > 0 ? Math.round(outstanding * 100) / 100 : 0;
};

/** Has every peso been received? */
export const isFullySettled = (res) => {
  if (!res) return false;
  if (String(res.paymentStatus ?? '').toLowerCase() !== 'paid') return false;
  return balanceDue(res) === 0;
};

/** Has the balance already been recorded as collected? */
export const isBalanceSettled = (res) => Boolean(res?.balanceSettledAt);

/**
 * Outstanding after accounting for a recorded settlement.
 *
 * balanceDue answers "what does this reservation owe by its own arithmetic";
 * this answers "what is still to collect right now". They differ the moment
 * staff record the handover, and the card needs the second one.
 */
export const outstandingBalance = (res) =>
  isBalanceSettled(res) ? 0 : balanceDue(res);
