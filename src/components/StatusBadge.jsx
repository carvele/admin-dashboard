import React from 'rechart';
import './StatusBadge.css';

const StatusBadge = ({ status }) => {
  const normalizedStatus = (status || 'unknown').toLowerCase();
  return (
    <span className={`status-badge status-${normalizedStatus}`}>
      {status}
    </span>
  );
};
export default StatusBadge;
