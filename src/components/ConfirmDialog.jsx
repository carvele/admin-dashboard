import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import './ConfirmDialog.css';

/**
 * A standard, accessible, styled modal dialog for destructive or high-impact actions.
 * Replaces native window.confirm() calls.
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
  isLoading = false
}) => {
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

  return (
    <div className="confirm-dialog-overlay" onClick={isLoading ? undefined : onCancel}>
      <div 
        className="confirm-dialog-content" 
        onClick={e => e.stopPropagation()}
        role="dialog"
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
          {isDestructive && (
            <div className="dialog-icon destructive">
              <AlertTriangle size={24} />
            </div>
          )}
          <h2 id="dialog-title">{title}</h2>
        </div>

        <div className="dialog-body">
          <p id="dialog-message">{message}</p>
        </div>

        <div className="dialog-footer">
          <button 
            className="dialog-btn-cancel" 
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button 
            className={`dialog-btn-confirm ${isDestructive ? 'destructive' : 'primary'}`} 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
