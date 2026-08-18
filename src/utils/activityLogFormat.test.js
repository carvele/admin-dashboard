import {
  getActionKind,
  humanizeKey,
  formatValue,
  formatLogSentence,
  extractChanges,
  extractContext,
  relativeTime,
  dateGroupLabel,
  groupLogsByDay,
  initialsOf,
  avatarColor,
} from './activityLogFormat';

describe('getActionKind', () => {
  it('classifies stock movements before generic updates', () => {
    expect(getActionKind('Restocked inventory item')).toBe('stock');
    expect(getActionKind('Manually triggered Inventory Sync')).toBe('stock');
  });

  it('classifies the common action families', () => {
    expect(getActionKind('Created new product')).toBe('create');
    expect(getActionKind('Archived staff member')).toBe('delete');
    expect(getActionKind('Restored inventory item')).toBe('restore');
    expect(getActionKind('Updated product details')).toBe('update');
    expect(getActionKind('Sent notification to customer')).toBe('message');
  });

  it('falls back to neutral rather than throwing', () => {
    expect(getActionKind('Something entirely new')).toBe('neutral');
    expect(getActionKind('')).toBe('neutral');
    expect(getActionKind(undefined)).toBe('neutral');
  });
});

describe('humanizeKey', () => {
  it('splits camelCase and snake_case', () => {
    expect(humanizeKey('qtyAdded')).toBe('Qty Added');
    expect(humanizeKey('item_name')).toBe('Item name');
  });
});

describe('formatValue', () => {
  it('renders empty-ish values as an em dash', () => {
    expect(formatValue(null)).toBe('—');
    expect(formatValue('')).toBe('—');
    expect(formatValue([])).toBe('—');
  });

  it('renders booleans, arrays and objects readably', () => {
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(['S', 'M'])).toBe('S, M');
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it('preserves zero rather than treating it as empty', () => {
    expect(formatValue(0)).toBe('0');
  });
});

describe('formatLogSentence', () => {
  it('pulls subject, qualifier and before/after out of a restock entry', () => {
    const s = formatLogSentence({
      action: 'Restocked inventory item',
      details: { itemName: 'Ivory Gown', size: 'M', qtyAdded: 8, qtyBefore: 4, qtyAfter: 12 },
    });
    expect(s.subject).toBe('Ivory Gown');
    expect(s.qualifier).toBe('M');
    expect(s.delta).toEqual({ from: '4', to: '12' });
  });

  it('joins multiple qualifiers into a variant label', () => {
    const s = formatLogSentence({
      action: 'Restocked inventory item',
      details: { itemName: 'Ivory Gown', size: 'M', color: 'Red', pattern: 'Solid' },
    });
    expect(s.qualifier).toBe('M / Red / Solid');
  });

  it('falls back to a bare amount when no before/after was recorded', () => {
    const s = formatLogSentence({
      action: 'Restocked inventory item',
      details: { itemName: 'Ivory Gown', qtyAdded: 8 },
    });
    expect(s.delta).toBeNull();
    expect(s.amount).toBe('+8');
  });

  it('always returns a usable action for unknown shapes', () => {
    expect(formatLogSentence({ action: 'Updated store operating hours' }).action)
      .toBe('Updated store operating hours');
    expect(formatLogSentence({}).action).toBe('Recorded activity');
    expect(formatLogSentence({ action: 'X', details: 'not-an-object' }).subject).toBeNull();
  });
});

describe('extractChanges', () => {
  it('reads the structured changes map', () => {
    const changes = extractChanges({ changes: { price: { from: 100, to: 150 } } });
    expect(changes).toEqual([{ field: 'Price', from: '100', to: '150' }]);
  });

  it('omits pairs whose values are identical', () => {
    expect(extractChanges({ changes: { price: { from: 100, to: 100 } } })).toEqual([]);
  });

  it('handles missing or malformed details safely', () => {
    expect(extractChanges(null)).toEqual([]);
    expect(extractChanges('nope')).toEqual([]);
    expect(extractChanges({})).toEqual([]);
  });
});

describe('extractContext', () => {
  it('returns only keys not already used by the sentence or diff', () => {
    const ctx = extractContext({
      itemName: 'Ivory Gown', // subject — consumed
      size: 'M', // qualifier — consumed
      qtyBefore: 4, // diff — consumed
      qtyAfter: 12, // diff — consumed
      qtyAdded: 8, // amount — consumed
      reason: 'Supplier delivery', // context — kept
    });
    expect(ctx).toEqual([{ key: 'Reason', value: 'Supplier delivery' }]);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-18T12:00:00Z').getTime();

  it('describes recent times in minutes and hours', () => {
    expect(relativeTime('2026-08-18T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-08-18T11:30:00Z', now)).toBe('30m ago');
    expect(relativeTime('2026-08-18T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-08-16T12:00:00Z', now)).toBe('2d ago');
  });

  it('returns an empty string for an invalid timestamp', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('dateGroupLabel', () => {
  const now = new Date(2026, 7, 18, 12, 0, 0); // 18 Aug 2026, local

  it('labels today and yesterday', () => {
    expect(dateGroupLabel(new Date(2026, 7, 18, 8, 0, 0), now)).toBe('Today');
    expect(dateGroupLabel(new Date(2026, 7, 17, 23, 0, 0), now)).toBe('Yesterday');
  });

  it('labels older days with a weekday and date', () => {
    expect(dateGroupLabel(new Date(2026, 7, 15, 9, 0, 0), now)).toMatch(/August/);
  });
});

describe('groupLogsByDay', () => {
  it('groups consecutive same-day entries into one run', () => {
    const now = new Date(2026, 7, 18, 12, 0, 0);
    const groups = groupLogsByDay([
      { id: 1, timestamp: new Date(2026, 7, 18, 10, 0, 0) },
      { id: 2, timestamp: new Date(2026, 7, 18, 9, 0, 0) },
      { id: 3, timestamp: new Date(2026, 7, 17, 9, 0, 0) },
    ], now);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].label).toBe('Yesterday');
  });

  it('returns an empty array for no logs', () => {
    expect(groupLogsByDay([])).toEqual([]);
  });
});

describe('initialsOf', () => {
  it('takes first and last initials', () => {
    expect(initialsOf('Jhosu Bautista')).toBe('JB');
    expect(initialsOf('Jhosu')).toBe('JH');
    expect(initialsOf('')).toBe('?');
  });
});

describe('avatarColor', () => {
  it('is stable for the same seed', () => {
    expect(avatarColor('user-1')).toEqual(avatarColor('user-1'));
  });

  it('always returns a usable colour pair', () => {
    const c = avatarColor('');
    expect(c).toHaveProperty('bg');
    expect(c).toHaveProperty('fg');
  });
});
