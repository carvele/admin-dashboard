import React, { useState } from 'react';
import { formatPHDate } from '../utils/dateFormatter';
import { Star, CheckCircle, Trash2, Pin, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import ReviewImageLightbox from './ReviewImageLightbox';

/**
 * ReviewCard
 *
 * Single shared review card used by both the Review Moderation page
 * (Reviews.jsx) and the Catalog per-product modal (ProductReviewsModal.jsx).
 *
 * Accepts the canonical Review shape from reviewService:
 *   { id, text, rating, date, userName, displayName, verifiedPurchase, images, productName?, adminReply?, isPinned?, likes?, dislikes? }
 *
 * Props:
 *   review          - canonical Review object (see reviewService.js)
 *   onDelete        - async (id: string) => void  - called after confirmation
 *   onUpdate        - async (id: string, updates: object) => void
 *   showProductName - render "Product: <name>" subtitle (true on the
 *                     moderation page, false inside the per-product modal)
 */
const ReviewCard = ({ review, onDelete, onUpdate, showProductName = false }) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState(review.adminReply || '');
  const [submittingReply, setSubmittingReply] = useState(false);

  const handleDeleteConfirm = async () => {
    setConfirmOpen(false);
    await onDelete(review.id);
  };

  const handleTogglePin = async () => {
    if (onUpdate) {
      await onUpdate(review.id, { is_pinned: !review.isPinned });
    }
  };

  const handleSaveReply = async () => {
    if (onUpdate) {
      setSubmittingReply(true);
      await onUpdate(review.id, { admin_reply: replyText.trim() || null });
      setSubmittingReply(false);
      setIsReplying(false);
    }
  };

  const stars = Array.from({ length: 5 }, (_, idx) => (
    <Star
      key={idx}
      size={15}
      fill={idx < review.rating ? 'currentColor' : 'none'}
      color={idx < review.rating ? 'var(--warning, var(--color-warning))' : 'var(--text-secondary, #9ca3af)'}
    />
  ));

  return (
    <>
      <div className={`review-card ${review.isPinned ? 'pinned' : ''}`} style={{ border: review.isPinned ? '1px solid var(--accent)' : undefined }}>
        {/* ── Header: author · verified badge · stars ── */}
        <div className="review-header">
          <div>
            <div className="review-author" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {review.isPinned && <Pin size={14} color="var(--accent)" fill="var(--accent)" />}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', margin: '4px 0 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary, inherit)' }}>
            {review.rating?.toFixed(1)}
          </span>
          <span>·</span>
          <span>{review.date ? formatPHDate(review.date) : ''}</span>
          
          {(review.likes > 0 || review.dislikes > 0) && (
            <>
              <span>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ThumbsUp size={12} /> {review.likes}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ThumbsDown size={12} /> {review.dislikes}
              </span>
            </>
          )}
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

        {/* Admin Reply Section */}
        {review.adminReply && !isReplying && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--beige)', borderRadius: '8px', fontSize: '0.85rem' }}>
            <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--charcoal)' }}>Response from JezSy Couture:</strong>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{review.adminReply}</p>
          </div>
        )}

        {isReplying && (
          <div style={{ marginTop: '1rem' }}>
            <textarea
              className="input-field"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a public response..."
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn-outline" onClick={() => setIsReplying(false)} disabled={submittingReply}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveReply} disabled={submittingReply}>Save Reply</button>
            </div>
          </div>
        )}

        {/* ── Footer: delete button ── */}
        <div className="review-footer" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {onUpdate && (
              <>
                <button
                  style={{ background: 'none', border: 'none', color: review.isPinned ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}
                  onClick={handleTogglePin}
                >
                  <Pin size={14} fill={review.isPinned ? 'var(--accent)' : 'none'} /> {review.isPinned ? 'Pinned' : 'Pin'}
                </button>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}
                  onClick={() => setIsReplying(!isReplying)}
                >
                  <MessageSquare size={14} /> {review.adminReply ? 'Edit Reply' : 'Reply'}
                </button>
              </>
            )}
          </div>
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
