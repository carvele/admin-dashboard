/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import { useEffect, useState } from 'react';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import './ConfirmDialog.css';

/**
 * A standard, accessible, styled modal dialog for destructive or high-impact actions.
 * Supports three severity tiers:
 * - LOW: Informational or mild confirmation (cancel / confirm)
 * - MEDIUM: Consequence descriptions with bullet points and loading locks
 * - HIGH: Irreversible actions with optional typed keyword confirmation
 */
const ConfirmDialog = ({
  isOpen,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = true,
  isLoading = false,
  severity, // 'LOW' | 'MEDIUM' | 'HIGH' (defaults to 'MEDIUM' if isDestructive, else 'LOW')
  consequences = [], // string[] of consequence summary bullet points
  confirmKeyword, // string: if provided, user must type this keyword to enable confirm
  confirmInputPlaceholder,
}) => {
  const [typedInput, setTypedInput] = useState('');

  // Determine effective severity
  const effectiveSeverity = severity || (isDestructive ? 'MEDIUM' : 'LOW');

  // Reset typed input when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setTypedInput('');
    }
  }, [isOpen]);

  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, isLoading]);

  if (!isOpen) return null;

  // Validation for typed confirmation
  const isKeywordMatching = !confirmKeyword || typedInput.trim().toLowerCase() === confirmKeyword.trim().toLowerCase();
  const isConfirmDisabled = isLoading || !isKeywordMatching;

  const renderIcon = () => {
    if (effectiveSeverity === 'HIGH' || isDestructive) {
      return (
        <div className="dialog-icon destructive">
          <AlertTriangle size={24} />
        </div>
      );
    }
    if (effectiveSeverity === 'MEDIUM') {
      return (
        <div className="dialog-icon warning">
          <AlertCircle size={24} />
        </div>
      );
    }
    return (
      <div className="dialog-icon info">
        <Info size={24} />
      </div>
    );
  };

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={e => { if (!isLoading && e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className={`confirm-dialog-content severity-${effectiveSeverity.toLowerCase()}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
      >
        <button 
          className="dialog-close-btn" 
          onClick={onCancel}
          disabled={isLoading}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>

        <div className="dialog-header">
          {renderIcon()}
          <h2 id="dialog-title">{title}</h2>
          {effectiveSeverity === 'HIGH' && (
            <span className="severity-badge high">Irreversible Action</span>
          )}
        </div>

        <div className="dialog-body">
          <p id="dialog-message">{message}</p>

          {consequences && consequences.length > 0 && (
            <div className="dialog-consequences">
              <div className="dialog-consequences-title">Impact Summary:</div>
              <ul className="dialog-consequences-list">
                {consequences.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {confirmKeyword && (
            <div className="dialog-typed-confirm">
              <label htmlFor="confirm-keyword-input" className="dialog-typed-label">
                To confirm, type <strong className="dialog-keyword-prompt">{confirmKeyword}</strong> below:
              </label>
              <input
                id="confirm-keyword-input"
                type="text"
                className="input-field dialog-typed-input"
                placeholder={confirmInputPlaceholder || `Type "${confirmKeyword}" to confirm`}
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                disabled={isLoading}
                autoComplete="off"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button 
            type="button"
            className="dialog-btn-cancel" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button 
            type="button"
            className={`dialog-btn-confirm ${isDestructive || effectiveSeverity === 'HIGH' ? 'destructive' : 'primary'}`} 
            onClick={onConfirm}
            disabled={isConfirmDisabled}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
