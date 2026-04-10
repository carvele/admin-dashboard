import React, { useState } from 'react';
import { Plus, Trash2, Ruler } from 'lucide-react';

const MeasurementTable = ({ sizes, measurements, onChange }) => {
  const [newMetric, setNewMetric] = useState('');
  
  // Unique metrics across all sizes
  const metrics = Array.from(new Set(
    Object.values(measurements || {}).flatMap(sizeObj => Object.keys(sizeObj))
  ));

  const handleAddField = () => {
    if (!newMetric.trim() || metrics.includes(newMetric.trim())) return;
    
    const updated = { ...measurements };
    sizes.forEach(size => {
      if (!updated[size]) updated[size] = {};
      updated[size][newMetric.trim()] = '';
    });
    
    onChange(updated);
    setNewMetric('');
  };

  const handleValueChange = (size, metric, value) => {
    const updated = { ...measurements };
    if (!updated[size]) updated[size] = {};
    updated[size][metric] = value;
    onChange(updated);
  };

  const handleRemoveMetric = (metric) => {
    const updated = { ...measurements };
    sizes.forEach(size => {
      if (updated[size]) {
        delete updated[size][metric];
      }
    });
    onChange(updated);
  };

  if (!sizes || sizes.length === 0) {
    return <div className="text-secondary italic">Select at least one size to add measurements.</div>;
  }

  return (
    <div className="measurement-table-container mt-4">
      <div className="flex gap-2 mb-4 items-center">
        <div className="relative flex-1">
          <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
          <input
            type="text"
            className="input-field pl-10"
            placeholder="Add metric (e.g. Chest Width, Length)"
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
          <Plus size={18} /> Add Metric
        </button>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="table w-full text-sm">
          <thead>
            <tr className="bg-light">
              <th className="p-3 text-left border-b font-semibold">Size</th>
              {metrics.map(metric => (
                <th key={metric} className="p-3 text-left border-b font-semibold group">
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
            {sizes.map(size => (
              <tr key={size} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 border-b font-bold bg-light/30">{size}</td>
                {metrics.map(metric => (
                  <td key={`${size}-${metric}`} className="p-2 border-b">
                    <input
                      type="text"
                      className="w-full bg-transparent border-none focus:ring-1 focus:ring-primary rounded p-1"
                      placeholder="--"
                      value={measurements?.[size]?.[metric] || ''}
                      onChange={(e) => handleValueChange(size, metric, e.target.value)}
                    />
                  </td>
                ))}
                {metrics.length === 0 && <td className="p-3 border-b text-secondary italic">--</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-secondary">
        Tip: Enter dimensions as they apply to the garment (e.g., "70 cm"). These will be visible to customers in the app's size guide.
      </p>
    </div>
  );
};

export default MeasurementTable;
