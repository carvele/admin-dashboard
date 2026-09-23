/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog. Rendered through a portal on document.body so it is never
 * clipped by (or nested inside) a scrolling parent such as the reservation
 * detail workspace. `stacked` dialogs sit above another open dialog without
 * painting a second backdrop.
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer = null,
  maxWidth = 540,
  className = '',
  stacked = false,
  dismissable = true,
}) => {
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const first = dialog?.querySelector(FOCUSABLE);
    (first || dialog)?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const nodes = [...dialog.querySelectorAll(FOCUSABLE)];
      if (nodes.length === 0) return;
      const head = nodes[0];
      const tail = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    // Capture phase so a stacked dialog handles Escape before the one beneath it.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [isOpen, dismissable]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`modal-overlay ${className}`}
      style={stacked ? { zIndex: 2100, backgroundColor: 'transparent', backdropFilter: 'none' } : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="modal-content"
        style={{ maxWidth, display: 'flex', flexDirection: 'column', maxHeight: 'min(90vh, 900px)', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <div className="modal-header">
          {title && <h2 id={titleId}>{title}</h2>}
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            disabled={!dismissable}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
