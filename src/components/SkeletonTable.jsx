import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const SkeletonTable = ({ columns = 5, rows = 10, includeHeader = true }) => {
  return (
    <div className="skeleton-table-container" style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {includeHeader && (
          <thead>
            <tr>
              {Array(columns).fill(0).map((_, i) => (
                <th key={`th-${i}`} style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)' }}>
                  <Skeleton height={20} width={`${Math.random() * 40 + 40}%`} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {Array(rows).fill(0).map((_, rowIndex) => (
            <tr key={`tr-${rowIndex}`}>
              {Array(columns).fill(0).map((_, colIndex) => (
                <td key={`td-${rowIndex}-${colIndex}`} style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)' }}>
                  <Skeleton height={20} width={`${Math.random() * 60 + 20}%`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SkeletonTable;
