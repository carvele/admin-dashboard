import React, { useState } from 'react';
import { Plus, Trash2, Ruler, RefreshCw, Copy } from 'lucide-react';
import { DEFAULT_MEASUREMENT_METRICS, AVAILABLE_SIZES } from '../../utils/constants';
import ConfirmDialog from '../ConfirmDialog';

const MeasurementTable = ({ sizes, measurements, onChange, category, subCategory }) => {
  const [newMetric, setNewMetric] = useState('');
  const [unit, setUnit] = useState('cm'); // 'cm' | 'in'
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Smart template matching logic
  const findSmartTemplate = () => {
    const templateKeys = Object.keys(DEFAULT_MEASUREMENT_METRICS);
    const searchTerms = [
      subCategory, 
      category
    ].filter(Boolean).map(s => s.toLowerCase());

    if (searchTerms.length === 0) return null;

    // 1. Exact/Hierarchical match
    for (const term of searchTerms) {
      const match = templateKeys.find(key => key.toLowerCase() === term);
      if (match) return DEFAULT_MEASUREMENT_METRICS[match];
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
      if (match) return DEFAULT_MEASUREMENT_METRICS[match];
    }

    return null;
  };

  const suggestedMetrics = findSmartTemplate();

  // Unique metrics across all sizes
  const metrics = Array.from(new Set(
    Object.values(measurements || {}).flatMap(sizeObj => Object.keys(sizeObj))
  ));

  const handleAddField = () => {
    if (!newMetric.trim() || metrics.includes(newMetric.trim())) return;
    
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
    if (recommended.length === 0) return;
    
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
    if (sizes.length <= 1) return;
    const firstSize = sizes[0];
    const sourceData = measurements[firstSize] || {};
    
    if (Object.keys(sourceData).length === 0) return;

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
          } else {
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
    setClearConfirmOpen(true);
  };

  const executeClearAll = () => {
    setClearConfirmOpen(false);
    const updated = {};
    sizes.forEach(size => {
      updated[size] = {};
    });
    onChange(updated);
  };

  if (!sizes || sizes.length === 0) {
    return <div className="text-secondary italic">Select at least one size to add measurements.</div>;
  }

  return (
    <div className="measurement-table-container mt-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex gap-2 flex-1 max-w-sm">
          <div className="relative flex-1">
            <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
            <input
              type="text"
              className="input-field pl-10"
              placeholder="Add metric (e.g. Chest Width)"
              value={newMetric}
              onChange={(e) => setNewMetric(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddField())}
            />
          </div>
          <button 
            type="button" 
            className="btn-primary flex items-center gap-2" 
            onClick={handleAddField}
            disabled={!newMetric.trim()}
          >
            <Plus size={18} /> Add
          </button>
        </div>

        <div className="flex items-center gap-3">
          {suggestedMetrics && (
            <button
              type="button"
              className="btn-outline small flex items-center gap-2"
              onClick={handleLoadRecommended}
              title="Load standard metrics for this category"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Load Suggested</span>
            </button>
          )}

          <button
            type="button"
            className="btn-outline small flex items-center gap-2"
            onClick={handleCopyToAll}
            disabled={sizes.length <= 1 || metrics.length === 0}
            title="Copy first size values to all other sizes"
          >
            <Copy size={14} />
            <span className="hidden sm:inline">Sync All Sizes</span>
          </button>

          <button
            type="button"
            className="btn-outline small flex items-center gap-2 text-danger hover:bg-red-50"
            onClick={handleClearAll}
            disabled={metrics.length === 0}
          >
            <Trash2 size={14} />
            <span className="hidden lg:inline">Clear</span>
          </button>

          <div className="flex bg-gray-100 rounded-lg p-1 shadow-inner gap-1">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${unit === 'cm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => unit !== 'cm' && toggleUnit()}
            >
              CM
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${unit === 'in' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => unit !== 'in' && toggleUnit()}
            >
              IN
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="table w-full text-xs">
          <thead>
            <tr className="bg-light">
              <th className="px-3 py-2 text-left border-b font-semibold">Size</th>
              {metrics.map(metric => (
                <th key={metric} className="px-3 py-2 text-left border-b font-semibold group">
                  <div className="flex items-center justify-between gap-2">
                    {metric}
                    <button 
                      type="button"
                      className="text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveMetric(metric)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </th>
              ))}
              {metrics.length === 0 && <th className="p-3 text-left border-b text-secondary italic">No metrics added yet</th>}
            </tr>
          </thead>
          <tbody>
            {[...sizes]
              .sort((a, b) => AVAILABLE_SIZES.indexOf(a) - AVAILABLE_SIZES.indexOf(b))
              .map(size => (
              <tr key={size} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-1 border-b font-bold bg-light/30">{size}</td>
                {metrics.map(metric => (
                  <td key={`${size}-${metric}`} className="px-2 py-0 border-b">
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-primary rounded px-1 py-1 text-center"
                        placeholder="--"
                        value={measurements?.[size]?.[metric] || ''}
                        onChange={(e) => handleValueChange(size, metric, e.target.value)}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-secondary pointer-events-none font-bold opacity-30 uppercase">
                        {unit}
                      </span>
                    </div>
                  </td>
                ))}
                {metrics.length === 0 && <td className="p-3 border-b text-secondary italic">--</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-secondary">
        Tip: Enter dimensions as they apply to the garment (e.g., &quot;70 cm&quot;). These will be visible to customers in the app&apos;s size guide.
      </p>

      <ConfirmDialog
        isOpen={clearConfirmOpen}
        title="Clear All Measurements"
        message="Are you sure you want to clear all measurements for all sizes? This cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={executeClearAll}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  );
};

export default MeasurementTable;
