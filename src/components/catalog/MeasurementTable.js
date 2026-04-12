import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState } from 'react';
import { Plus, Trash2, Ruler, RefreshCw, Copy } from 'lucide-react';
import { DEFAULT_MEASUREMENT_METRICS, AVAILABLE_SIZES } from '../../utils/constants';
const MeasurementTable = ({ sizes, measurements, onChange, category, subCategory }) => {
    const [newMetric, setNewMetric] = useState('');
    const [unit, setUnit] = useState('cm'); // 'cm' | 'in'
    // Smart template matching logic
    const findSmartTemplate = () => {
        const templateKeys = Object.keys(DEFAULT_MEASUREMENT_METRICS);
        const searchTerms = [
            subCategory,
            category
        ].filter(Boolean).map(s => s.toLowerCase());
        if (searchTerms.length === 0)
            return null;
        // 1. Exact/Hierarchical match
        for (const term of searchTerms) {
            const match = templateKeys.find(key => key.toLowerCase() === term);
            if (match)
                return DEFAULT_MEASUREMENT_METRICS[match];
        }
        // 2. Fuzzy/Substring match
        for (const term of searchTerms) {
            const match = templateKeys.find(key => {
                const k = key.toLowerCase();
                // Remove trailing 's' for simple plural matching
                const singularK = k.endsWith('s') ? k.slice(0, -1) : k;
                const singularTerm = term.endsWith('s') ? term.slice(0, -1) : term;
                return term.includes(k) || k.includes(term) ||
                    term.includes(singularK) || singularK.includes(singularTerm);
            });
            if (match)
                return DEFAULT_MEASUREMENT_METRICS[match];
        }
        return null;
    };
    const suggestedMetrics = findSmartTemplate();
    // Unique metrics across all sizes
    const metrics = Array.from(new Set(Object.values(measurements || {}).flatMap(sizeObj => Object.keys(sizeObj))));
    const handleAddField = () => {
        if (!newMetric.trim() || metrics.includes(newMetric.trim()))
            return;
        const updated = { ...measurements };
        sizes.forEach(size => {
            // Create a fresh clone of the size object to avoid mutating previous state
            updated[size] = { ...(updated[size] || {}) };
            updated[size][newMetric.trim()] = '';
        });
        onChange(updated);
        setNewMetric('');
    };
    const handleValueChange = (size, metric, value) => {
        const updated = { ...measurements };
        // Clone the specific size object before updating its metric value
        updated[size] = { ...(updated[size] || {}), [metric]: value };
        onChange(updated);
    };
    const handleRemoveMetric = (metric) => {
        const updated = { ...measurements };
        sizes.forEach(size => {
            if (updated[size]) {
                const sizeObj = { ...updated[size] };
                delete sizeObj[metric];
                updated[size] = sizeObj;
            }
        });
        onChange(updated);
    };
    const handleLoadRecommended = () => {
        const recommended = suggestedMetrics || [];
        if (recommended.length === 0)
            return;
        const updated = { ...measurements };
        sizes.forEach(size => {
            updated[size] = { ...(updated[size] || {}) };
            recommended.forEach(metric => {
                if (updated[size][metric] === undefined) {
                    updated[size][metric] = '';
                }
            });
        });
        onChange(updated);
    };
    const handleCopyToAll = () => {
        if (sizes.length <= 1)
            return;
        const firstSize = sizes[0];
        const sourceData = measurements[firstSize] || {};
        if (Object.keys(sourceData).length === 0)
            return;
        const updated = { ...measurements };
        sizes.slice(1).forEach(size => {
            updated[size] = { ...sourceData };
        });
        onChange(updated);
    };
    const toggleUnit = () => {
        const newUnit = unit === 'cm' ? 'in' : 'cm';
        const factor = newUnit === 'in' ? 1 / 2.54 : 2.54;
        const updated = { ...measurements };
        sizes.forEach(size => {
            if (updated[size]) {
                const converted = {};
                Object.entries(updated[size]).forEach(([metric, val]) => {
                    if (val && !isNaN(val)) {
                        // Convert and round to 1 decimal place
                        converted[metric] = (parseFloat(val) * factor).toFixed(1);
                    }
                    else {
                        converted[metric] = val;
                    }
                });
                updated[size] = converted;
            }
        });
        setUnit(newUnit);
        onChange(updated);
    };
    const handleClearAll = () => {
        if (window.confirm('Clear all measurements?')) {
            const updated = {};
            sizes.forEach(size => {
                updated[size] = {};
            });
            onChange(updated);
        }
    };
    if (!sizes || sizes.length === 0) {
        return _jsx("div", { className: "text-secondary italic", children: "Select at least one size to add measurements." });
    }
    return (_jsxs("div", { className: "measurement-table-container mt-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4 mb-4", children: [_jsxs("div", { className: "flex gap-2 flex-1 max-w-sm", children: [_jsxs("div", { className: "relative flex-1", children: [_jsx(Ruler, { className: "absolute left-3 top-1/2 -translate-y-1/2 text-secondary", size: 16 }), _jsx("input", { type: "text", className: "input-field pl-10", placeholder: "Add metric (e.g. Chest Width)", value: newMetric, onChange: (e) => setNewMetric(e.target.value), onKeyPress: (e) => e.key === 'Enter' && (e.preventDefault(), handleAddField()) })] }), _jsxs("button", { type: "button", className: "btn-primary flex items-center gap-2", onClick: handleAddField, disabled: !newMetric.trim(), children: [_jsx(Plus, { size: 18 }), " Add"] })] }), _jsxs("div", { className: "flex items-center gap-3", children: [suggestedMetrics && (_jsxs("button", { type: "button", className: "btn-outline small flex items-center gap-2", onClick: handleLoadRecommended, title: "Load standard metrics for this category", children: [_jsx(RefreshCw, { size: 14 }), _jsx("span", { className: "hidden sm:inline", children: "Load Suggested" })] })), _jsxs("button", { type: "button", className: "btn-outline small flex items-center gap-2", onClick: handleCopyToAll, disabled: sizes.length <= 1 || metrics.length === 0, title: "Copy first size values to all other sizes", children: [_jsx(Copy, { size: 14 }), _jsx("span", { className: "hidden sm:inline", children: "Sync All Sizes" })] }), _jsxs("button", { type: "button", className: "btn-outline small flex items-center gap-2 text-danger hover:bg-red-50", onClick: handleClearAll, disabled: metrics.length === 0, children: [_jsx(Trash2, { size: 14 }), _jsx("span", { className: "hidden lg:inline", children: "Clear" })] }), _jsxs("div", { className: "flex rounded-xl p-1.5 border shadow-sm", style: { backgroundColor: 'var(--beige)' }, children: [_jsx("button", { type: "button", className: `px-5 py-2 text-sm font-extrabold rounded-lg transition-all ${unit === 'cm' ? 'bg-charcoal text-white shadow-md' : 'text-secondary hover:text-charcoal'}`, style: unit === 'cm' ? { backgroundColor: 'var(--charcoal)', color: 'white' } : {}, onClick: () => unit !== 'cm' && toggleUnit(), children: "CM" }), _jsx("button", { type: "button", className: `px-5 py-2 text-sm font-extrabold rounded-lg transition-all ${unit === 'in' ? 'bg-charcoal text-white shadow-md' : 'text-secondary hover:text-charcoal'}`, style: unit === 'in' ? { backgroundColor: 'var(--charcoal)', color: 'white' } : {}, onClick: () => unit !== 'in' && toggleUnit(), children: "IN" })] })] })] }), _jsx("div", { className: "overflow-x-auto border rounded-lg", children: _jsxs("table", { className: "table w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-light", children: [_jsx("th", { className: "p-3 text-left border-b font-semibold", children: "Size" }), metrics.map(metric => (_jsx("th", { className: "p-3 text-left border-b font-semibold group", children: _jsxs("div", { className: "flex items-center justify-between gap-2", children: [metric, _jsx("button", { type: "button", className: "text-danger opacity-0 group-hover:opacity-100 transition-opacity", onClick: () => handleRemoveMetric(metric), children: _jsx(Trash2, { size: 12 }) })] }) }, metric))), metrics.length === 0 && _jsx("th", { className: "p-3 text-left border-b text-secondary italic", children: "No metrics added yet" })] }) }), _jsx("tbody", { children: [...sizes]
                                .sort((a, b) => AVAILABLE_SIZES.indexOf(a) - AVAILABLE_SIZES.indexOf(b))
                                .map(size => (_jsxs("tr", { className: "hover:bg-slate-50 transition-colors", children: [_jsx("td", { className: "p-3 border-b font-bold bg-light/30", children: size }), metrics.map(metric => (_jsx("td", { className: "p-2 border-b", children: _jsxs("div", { className: "relative", children: [_jsx("input", { type: "text", inputMode: "decimal", className: "w-full bg-transparent border-none focus:ring-1 focus:ring-primary rounded p-1", placeholder: "--", value: measurements?.[size]?.[metric] || '', onChange: (e) => handleValueChange(size, metric, e.target.value) }), _jsx("span", { className: "absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-secondary pointer-events-none font-bold opacity-30 uppercase", children: unit })] }) }, `${size}-${metric}`))), metrics.length === 0 && _jsx("td", { className: "p-3 border-b text-secondary italic", children: "--" })] }, size))) })] }) }), _jsx("p", { className: "mt-2 text-xs text-secondary", children: "Tip: Enter dimensions as they apply to the garment (e.g., \"70 cm\"). These will be visible to customers in the app's size guide." })] }));
};
export default MeasurementTable;
