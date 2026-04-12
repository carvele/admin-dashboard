import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import './StatusBadge.css';
const StatusBadge = ({ status }) => {
    const normalizedStatus = (status || 'unknown').toLowerCase().replace(/\s+/g, '-');
    return _jsx("span", { className: `status-badge status-${normalizedStatus}`, children: status });
};
export default StatusBadge;
