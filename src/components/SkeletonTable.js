import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
const SkeletonTable = ({ columns = 5, rows = 10, includeHeader = true }) => {
    return (_jsx("div", { className: "skeleton-table-container", style: { width: '100%', overflowX: 'auto' }, children: _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [includeHeader && (_jsx("thead", { children: _jsx("tr", { children: Array(columns).fill(0).map((_, i) => (_jsx("th", { style: { padding: '16px 24px', borderBottom: '1px solid #eee' }, children: _jsx(Skeleton, { height: 20, width: `${Math.random() * 40 + 40}%` }) }, `th-${i}`))) }) })), _jsx("tbody", { children: Array(rows).fill(0).map((_, rowIndex) => (_jsx("tr", { children: Array(columns).fill(0).map((_, colIndex) => (_jsx("td", { style: { padding: '16px 24px', borderBottom: '1px solid #eee' }, children: _jsx(Skeleton, { height: 20, width: `${Math.random() * 60 + 20}%` }) }, `td-${rowIndex}-${colIndex}`))) }, `tr-${rowIndex}`))) })] }) }));
};
export default SkeletonTable;
