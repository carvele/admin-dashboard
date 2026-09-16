import React, { useState, useRef } from 'react';
import {
  Plus,
  Trash2,
  Star,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  Palette,
  CheckCircle2,
} from 'lucide-react';
import { getChipColorDot } from '../../utils/constants';
import './ColorwayMediaManager.css';

/**
 * Validates the colorways array before saving.
 * Returns { isValid: boolean, error: string | null }
 */
export const validateColorways = (colorways) => {
  if (!colorways || colorways.length === 0) {
    return { isValid: false, error: 'At least one colorway is required.' };
  }

  const normalizedNames = new Set();
  let defaultCount = 0;

  for (let i = 0; i < colorways.length; i++) {
    const cw = colorways[i];
    const trimmed = (cw.colorName || '').trim();
    if (!trimmed) {
      return { isValid: false, error: `Colorway #${i + 1} must have a valid color name.` };
    }

    const norm = trimmed.toLowerCase();
    if (normalizedNames.has(norm)) {
      return { isValid: false, error: `Duplicate color name "${trimmed}". Color names must be unique.` };
    }
    normalizedNames.add(norm);

    if (cw.isDefault) {
      defaultCount++;
    }
  }

  if (defaultCount > 1) {
    return { isValid: false, error: 'Only one colorway can be designated as the default.' };
  }

  return { isValid: true, error: null };
};

const ColorwayMediaManager = ({
  colorways = [],
  onChange,
  colorList = [],
  readOnly = false,
}) => {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const fileInputRef = useRef(null);

  const safeActiveIdx = Math.min(Math.max(0, activeTabIdx), Math.max(0, colorways.length - 1));
  const activeColorway = colorways[safeActiveIdx] || null;

  // Derive predefined color names and hex map from canonical taxonomy
  const colorOptions = React.useMemo(() => {
    return colorList.map((c) => {
      const name = typeof c === 'string' ? c : (c.name || '');
      const hex = (typeof c === 'object' && c.hex) ? c.hex : getChipColorDot(name);
      return { name, hex };
    }).filter((c) => Boolean(c.name));
  }, [colorList]);

  // Compute available options for active colorway, preserving legacy colors absent from taxonomy
  const availableColorOptions = React.useMemo(() => {
    const list = [...colorOptions];
    if (activeColorway?.colorName) {
      const exists = list.some((c) => c.name.toLowerCase() === activeColorway.colorName.trim().toLowerCase());
      if (!exists) {
        list.push({
          name: activeColorway.colorName,
          hex: activeColorway.hexColor || getChipColorDot(activeColorway.colorName),
          isLegacy: true,
        });
      }
    }
    return list;
  }, [colorOptions, activeColorway?.colorName, activeColorway?.hexColor]);

  const updateColorway = (index, updates) => {
    if (readOnly) return;
    const next = colorways.map((cw, i) => (i === index ? { ...cw, ...updates } : cw));
    onChange(next);
  };

  const handleAddColorway = () => {
    if (readOnly) return;
    // Suggest an unused color from available taxonomy colors
    const usedNames = new Set(colorways.map((c) => (c.colorName || '').trim().toLowerCase()));
    const suggested = colorOptions.find((c) => !usedNames.has(c.name.toLowerCase()));

    const newColorName = suggested ? suggested.name : (colorOptions[0]?.name || '');
    const newHex = suggested ? suggested.hex : (colorOptions[0]?.hex || getChipColorDot(newColorName));

    const newColorway = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      colorName: newColorName,
      displayName: newColorName,
      hexColor: newHex,
      isDefault: colorways.length === 0,
      sortOrder: colorways.length,
      primaryImageUrl: '',
      images: [],
      pendingFiles: [],
    };

    const next = [...colorways, newColorway];
    onChange(next);
    setActiveTabIdx(next.length - 1);
  };

  const handleRemoveColorway = (index) => {
    if (readOnly || colorways.length <= 1) return;

    const removingWasDefault = colorways[index].isDefault;
    const filtered = colorways.filter((_, i) => i !== index);

    // If we removed the default colorway, promote the first remaining colorway to default
    let next = filtered;
    if (removingWasDefault && filtered.length > 0) {
      next = filtered.map((cw, i) => (i === 0 ? { ...cw, isDefault: true } : cw));
    }

    // Re-index sortOrder
    next = next.map((cw, i) => ({ ...cw, sortOrder: i }));

    onChange(next);
    if (activeTabIdx >= next.length) {
      setActiveTabIdx(Math.max(0, next.length - 1));
    }
  };

  const handleSetDefault = (index) => {
    if (readOnly) return;
    const next = colorways.map((cw, i) => ({
      ...cw,
      isDefault: i === index,
    }));
    onChange(next);
  };

  const handleMoveColorway = (fromIdx, direction) => {
    if (readOnly) return;
    const toIdx = fromIdx + direction;
    if (toIdx < 0 || toIdx >= colorways.length) return;

    const copy = [...colorways];
    const [moved] = copy.splice(fromIdx, 1);
    copy.splice(toIdx, 0, moved);

    const reordered = copy.map((cw, idx) => ({ ...cw, sortOrder: idx }));
    onChange(reordered);
    setActiveTabIdx(toIdx);
  };

  const handleFilesSelect = (e) => {
    if (readOnly || !activeColorway) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPending = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    const nextPending = [...(activeColorway.pendingFiles || []), ...newPending];

    // If colorway had no images, nominate first image preview as primary cover
    let primaryUrl = activeColorway.primaryImageUrl;
    if (!primaryUrl && (activeColorway.images || []).length === 0 && newPending.length > 0) {
      primaryUrl = newPending[0].previewUrl;
    }

    updateColorway(safeActiveIdx, {
      pendingFiles: nextPending,
      primaryImageUrl: primaryUrl,
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveExistingImage = (imgIdx) => {
    if (readOnly || !activeColorway) return;
    const remaining = (activeColorway.images || []).filter((_, i) => i !== imgIdx);
    let primaryUrl = activeColorway.primaryImageUrl;
    if (primaryUrl === (activeColorway.images[imgIdx]?.imageUrl || activeColorway.images[imgIdx])) {
      primaryUrl = remaining[0]?.imageUrl || remaining[0] || (activeColorway.pendingFiles[0]?.previewUrl || '');
    }
    updateColorway(safeActiveIdx, {
      images: remaining,
      primaryImageUrl: primaryUrl,
    });
  };

  const handleRemovePendingFile = (pendingIdx) => {
    if (readOnly || !activeColorway) return;
    const target = activeColorway.pendingFiles[pendingIdx];
    if (target?.previewUrl) {
      try {
        URL.revokeObjectURL(target.previewUrl);
      } catch {
        // Safe to ignore if already revoked
      }
    }
    const remainingPending = activeColorway.pendingFiles.filter((_, i) => i !== pendingIdx);
    updateColorway(safeActiveIdx, {
      pendingFiles: remainingPending,
    });
  };

  const handleMoveExistingImage = (imgIdx, direction) => {
    if (readOnly || !activeColorway) return;
    const images = [...(activeColorway.images || [])];
    const targetIdx = imgIdx + direction;
    if (targetIdx < 0 || targetIdx >= images.length) return;

    const [moved] = images.splice(imgIdx, 1);
    images.splice(targetIdx, 0, moved);

    const reordered = images.map((img, idx) => ({
      ...(typeof img === 'string' ? { imageUrl: img } : img),
      sortOrder: idx,
    }));

    // If first image moved, update primary cover
    const newPrimary = reordered[0]?.imageUrl || reordered[0] || activeColorway.primaryImageUrl;

    updateColorway(safeActiveIdx, {
      images: reordered,
      primaryImageUrl: newPrimary,
    });
  };

  const handleSetPrimaryImage = (imageUrl) => {
    if (readOnly || !activeColorway) return;
    updateColorway(safeActiveIdx, { primaryImageUrl: imageUrl });
  };

  return (
    <div className="colorway-manager">
      {/* ── Colorways Tabs Navigation ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="colorway-tabs-bar flex-1">
          {colorways.map((cw, idx) => {
            const isActive = idx === safeActiveIdx;
            const totalImgs = (cw.images || []).length + (cw.pendingFiles || []).length;
            return (
              <div
                key={cw.id || `cw-${idx}`}
                className={`colorway-tab ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTabIdx(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTabIdx(idx);
                  }
                }}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
              >
                <div
                  className="colorway-swatch-dot"
                  style={{ backgroundColor: cw.hexColor || getChipColorDot(cw.colorName) }}
                />
                <span className="font-semibold text-xs">
                  {cw.displayName || cw.colorName || `Colorway ${idx + 1}`}
                </span>
                {cw.isDefault && <span className="colorway-default-pill">DEFAULT</span>}
                <span className="colorway-img-count">{totalImgs} img</span>

                {!readOnly && (
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveColorway(idx, -1);
                      }}
                      disabled={idx === 0}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 p-0.5"
                      title="Move Left"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveColorway(idx, 1);
                      }}
                      disabled={idx === colorways.length - 1}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 p-0.5"
                      title="Move Right"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={handleAddColorway}
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 whitespace-nowrap"
          >
            <Plus size={14} /> Add Colorway
          </button>
        )}
      </div>

      {/* ── Active Colorway Configuration Card ── */}
      {activeColorway && (
        <div className="colorway-panel-card space-y-5">
          {/* Card Header & Metadata */}
          <div className="colorway-fields-grid">
            {/* Canonical Color Selector */}
            <div>
              <label className="label text-xs" htmlFor="colorway-canonical-color">
                Color * <span className="text-[11px] text-gray-500">(JezSy Taxonomy)</span>
              </label>
              <select
                id="colorway-canonical-color"
                className="input-field text-sm"
                value={activeColorway.colorName || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const matched = availableColorOptions.find((c) => c.name.toLowerCase() === val.toLowerCase());
                  const derivedHex = matched?.hex || getChipColorDot(val);
                  updateColorway(safeActiveIdx, {
                    colorName: val,
                    displayName: (!activeColorway.displayName || activeColorway.displayName === activeColorway.colorName) ? val : activeColorway.displayName,
                    hexColor: derivedHex,
                  });
                }}
                disabled={readOnly}
                required
              >
                <option value="" disabled>Select from JezSy Colors...</option>
                {availableColorOptions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} {c.isLegacy ? '(Legacy)' : ''}
                  </option>
                ))}
              </select>

              {activeColorway.colorName ? (
                <div className="colorway-selected-preview flex items-center gap-2 mt-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs">
                  <span
                    className="colorway-swatch-dot inline-block shrink-0"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      backgroundColor: activeColorway.hexColor || getChipColorDot(activeColorway.colorName),
                      border: '1px solid #cbd5e1',
                    }}
                  />
                  <span className="font-semibold text-gray-800">
                    {activeColorway.colorName}
                  </span>
                  <span className="text-gray-400 font-mono text-[11px]">
                    {activeColorway.hexColor || getChipColorDot(activeColorway.colorName)}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Display / Marketing Name */}
            <div>
              <label className="label text-xs" htmlFor="colorway-display-name">
                Display Name <span className="text-[11px] text-gray-500">(customer facing marketing title)</span>
              </label>
              <input
                id="colorway-display-name"
                type="text"
                className="input-field text-sm"
                value={activeColorway.displayName || ''}
                onChange={(e) => updateColorway(safeActiveIdx, { displayName: e.target.value })}
                placeholder="e.g. Midnight Navy (optional)"
                disabled={readOnly}
              />
            </div>

            {/* Default Status & Actions */}
            <div className="flex items-center gap-3 justify-end">
              {activeColorway.isDefault ? (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-xs font-semibold">
                  <CheckCircle2 size={14} className="text-amber-600" /> Default Colorway
                </div>
              ) : (
                !readOnly && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(safeActiveIdx)}
                    className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300"
                    title="Set this colorway as the primary catalog default"
                  >
                    <Star size={14} /> Set as Default
                  </button>
                )
              )}

              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleRemoveColorway(safeActiveIdx)}
                  disabled={colorways.length <= 1}
                  className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-25 rounded-md hover:bg-red-50 transition-colors"
                  title={colorways.length <= 1 ? 'Cannot delete the only colorway' : 'Delete this colorway'}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* ── Per-Colorway Image Gallery ── */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Palette size={13} /> Colorway Gallery: {activeColorway.displayName || activeColorway.colorName}
                </h4>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Images shown when a customer taps this color swatch. The first or starred image is the primary cover.
                </p>
              </div>
            </div>

            <div className="colorway-gallery-grid">
              {/* Existing Server Images */}
              {(activeColorway.images || []).map((img, imgIdx) => {
                const imgUrl = typeof img === 'string' ? img : img.imageUrl;
                const isPrimary = activeColorway.primaryImageUrl
                  ? activeColorway.primaryImageUrl === imgUrl
                  : imgIdx === 0;

                return (
                  <div
                    key={img.id || `img-${imgIdx}`}
                    className={`colorway-gallery-item ${isPrimary ? 'is-primary' : ''}`}
                  >
                    <img src={imgUrl} alt={`${activeColorway.colorName} ${imgIdx + 1}`} className="colorway-gallery-img" />
                    {isPrimary && <div className="colorway-primary-badge">PRIMARY COVER</div>}

                    {!readOnly && (
                      <div className="colorway-gallery-overlay">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMoveExistingImage(imgIdx, -1)}
                            disabled={imgIdx === 0}
                            className="colorway-gallery-btn"
                            title="Move Left"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryImage(imgUrl)}
                            className={`colorway-gallery-btn ${isPrimary ? 'text-amber-400' : 'text-white'}`}
                            title={isPrimary ? 'Primary Cover Image' : 'Set as Primary Cover'}
                          >
                            <Star size={14} fill={isPrimary ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveExistingImage(imgIdx, 1)}
                            disabled={imgIdx === (activeColorway.images || []).length - 1}
                            className="colorway-gallery-btn"
                            title="Move Right"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveExistingImage(imgIdx)}
                          className="w-full py-1 bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold rounded uppercase tracking-wider"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pending Upload Previews */}
              {(activeColorway.pendingFiles || []).map((pending, pIdx) => (
                <div
                  key={`pending-${pIdx}`}
                  className="colorway-gallery-item pending"
                >
                  <img src={pending.previewUrl} alt={`New upload ${pIdx + 1}`} className="colorway-gallery-img opacity-80" />
                  <div className="absolute top-1 left-1 bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                    PENDING
                  </div>
                  {!readOnly && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleRemovePendingFile(pIdx)}
                        className="p-1.5 bg-red-600 text-white rounded-full shadow"
                        title="Cancel upload"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Upload Dropzone */}
              {!readOnly && (
                <label className="colorway-dropzone">
                  <Upload size={22} className="text-gray-400 mb-1" />
                  <span className="text-[11px] font-bold text-gray-600">Add Photos</span>
                  <span className="text-[9px] text-gray-400">JPG, PNG, WEBP</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleFilesSelect}
                  />
                </label>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ColorwayMediaManager;
