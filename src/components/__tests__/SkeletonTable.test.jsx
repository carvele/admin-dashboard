import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import SkeletonTable from '../SkeletonTable';

describe('SkeletonTable Component', () => {
  it('renders default 5 columns and 10 rows with headers', () => {
    const { container } = render(<SkeletonTable />);
    const headers = container.querySelectorAll('th');
    const rows = container.querySelectorAll('tbody tr');

    expect(headers.length).toBe(5);
    expect(rows.length).toBe(10);
  });

  it('renders custom column and row counts without headers when requested', () => {
    const { container } = render(<SkeletonTable columns={3} rows={4} includeHeader={false} />);
    const thead = container.querySelector('thead');
    const rows = container.querySelectorAll('tbody tr');
    const cells = container.querySelectorAll('tbody td');

    expect(thead).toBeNull();
    expect(rows.length).toBe(4);
    expect(cells.length).toBe(12);
  });
});
