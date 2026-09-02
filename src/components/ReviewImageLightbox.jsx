import React from 'react';
import { X } from 'lucide-react';

/**
 * ReviewImageLightbox
 *
 * Full-screen overlay that displays a single review image. Meets WCAG 2.1
 * keyboard access (Escape/Enter/Space to close) and has an explicit close
 * button with aria-label.
 *
 * Props:
 *   src      – image URL to display (truthy check controls visibility)
 *   onClose  – callback fired when the user dismisses the lightbox
 */
const ReviewImageLightbox = ({ src, onClose }) => {
  if (!src) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
      }}
      role="button"
      tabIndex={0}
      aria-label="Close image preview"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        style={{ position: 'relative' }}
      >
        <button
          onClick={onClose}
          aria-label="Close image preview"
          style={{
            position: 'absolute',
            top: -12,
            right: -12,
            background: 'white',
            border: 'none',
            borderRadius: '50%',
            width: 28,
            height: 28,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={16} />
        </button>
        <img
          src={src}
          alt="Full resolution review attachment"
          style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 'var(--spacing-sm)' }}
        />
      </div>
    </div>
  );
};

export default ReviewImageLightbox;
