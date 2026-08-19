import React, { useState } from 'react';
import { Star, CheckCircle, Trash2 } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import ReviewImageLightbox from './ReviewImageLightbox';

/**
 * ReviewCard
 *
 * Single shared review card used by both the Review Moderation page
 * (Reviews.jsx) and the Catalog per-product modal (ProductReviewsModal.jsx).
 *
 * Accepts the canonical Review shape from reviewService:
 *   { id, text, rating, date, userName, displayName, verifiedPurchase, images, productName? }
 *
 * Props:
 *   review          – canonical Review object (see reviewService.js)
 *   onDelete        – async (id: string) => void  — called after confirmation
 *   showProductName – render "Product: <name>" subtitle (true on the
 *                     moderation page, false inside the per-product modal)
 */
const ReviewCard = ({ review, onDelete, showProductName = false }) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const handleDeleteConfirm = async () => {
    setConfirmOpen(false);
    await onDelete(review.id);
  };

  const stars = Array.from({ length: 5 }, (_, idx) => (
    <Star
      key={idx}
      size={15}
      fill={idx < review.rating ? 'currentColor' : 'none'}
      color={idx < review.rating ? 'var(--warning, #f59e0b)' : 'var(--text-secondary, #9ca3af)'}
    />
  ));

  return (
    <>
      <div className="review-card">
        {/* ── Header: author · verified badge · stars ── */}
        <div className="review-header">
          <div>
            <div className="review-author">
              {review.displayName}
              {review.verifiedPurchase && (
                <CheckCircle
                  size={14}
                  className="verified-badge"
                  title="Verified Purchase"
                  aria-label="Verified Purchase"
                />
              )}
            </div>
            {showProductName && review.productName && (
              <div className="review-product">Product: {review.productName}</div>
            )}
          </div>

          <div className="stars" aria-label={`${review.rating} out of 5 stars`}>
            {stars}
          </div>
        </div>

        {/* ── Rating value + date ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary, inherit)' }}>
            {review.rating?.toFixed(1)}
          </span>
          <span>·</span>
          <span>{review.date ? new Date(review.date).toLocaleDateString() : ''}</span>
        </div>

        {/* ── Review text ── */}
        {review.text && (
          <p className="review-body">{review.text}</p>
        )}

        {/* ── Attached images ── */}
        {review.images && review.images.length > 0 && (
          <div className="review-images">
            {review.images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                className="review-thumb-btn"
                onClick={() => setSelectedImage(img)}
                aria-label={`View review image ${idx + 1} of ${review.images.length}`}
              >
                <img
                  src={img}
                  alt={`Review attachment ${idx + 1}`}
                  className="review-thumb"
                />
              </button>
            ))}
          </div>
        )}

        {/* ── Footer: delete button ── */}
        <div className="review-footer">
          <span />
          <button
            className="delete-btn"
            onClick={() => setConfirmOpen(true)}
            title="Delete Review"
            aria-label={`Delete review by ${review.displayName}`}
          >
            <Trash2 size={15} aria-hidden="true" /> Delete
          </button>
        </div>
      </div>

      {/* Lightbox — rendered outside card so z-index stacks above any parent modal */}
      <ReviewImageLightbox src={selectedImage} onClose={() => setSelectedImage(null)} />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Review"
        message="Are you sure you want to delete this review? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};

export default ReviewCard;
