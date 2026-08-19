import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { getProductReviews, deleteReview } from '../../services/reviewService';
import { updateProduct } from '../../services/productService';
import { toast } from 'sonner';
import ReviewCard from '../../components/ReviewCard';

/**
 * ProductReviewsModal
 *
 * Contextual modal opened from the Clothing Catalog "View Reviews" button.
 * Shows reviews for a single product inline so the admin stays in the catalog
 * context (NN Heuristic #7 — Flexibility and Efficiency).
 *
 * WCAG 2.1 Level A compliance:
 *   - Focus moves into the modal on open (2.4.3 Focus Order)
 *   - Escape key closes the modal (2.1.1 Keyboard)
 *   - Focus returns to the trigger element on close (2.4.3 Focus Order)
 *   - role="dialog" + aria-modal="true" + aria-labelledby (4.1.2 Name, Role, Value)
 */
const ProductReviewsModal = ({ product, onClose, onReviewsChanged, triggerRef }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // WCAG 2.4.3: close button gets focus on open; overlay holds the escape handler.
  const closeBtnRef = useRef(null);
  const titleId     = `modal-title-${product.docId || product.id}`;

  // ── WCAG focus management ──────────────────────────────────────────────────
  useEffect(() => {
    // Move focus into the modal (to the close button) when it mounts.
    closeBtnRef.current?.focus();

    // Return focus to the catalog trigger when the modal unmounts.
    return () => {
      triggerRef?.current?.focus();
    };
  }, [triggerRef]);

  // Escape key closes the modal (WCAG 2.1.1).
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }, [onClose]);
  // ──────────────────────────────────────────────────────────────────────────

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProductReviews(product.docId || product.id);
      setReviews(data);
    } catch (err) {
      console.error('[ProductReviewsModal] fetch error:', err);
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  /**
   * Called by ReviewCard after the user confirms deletion.
   * Updates local list optimistically and recalculates product stats.
   */
  const handleDelete = useCallback(async (reviewId) => {
    try {
      await deleteReview(reviewId);
      toast.success('Review deleted');

      setReviews(prev => {
        const next = prev.filter(r => r.id !== reviewId);

        // Recalculate the product's average rating and review count.
        const sum = next.reduce((acc, r) => acc + (r.rating || 0), 0);
        const avg = next.length > 0 ? sum / next.length : 0;

        updateProduct(product.docId || product.id, {
          rating: avg,
          reviewCount: next.length,
        }).catch(err => console.error('[ProductReviewsModal] updateProduct error:', err));

        if (onReviewsChanged) {
          onReviewsChanged(product.docId || product.id, avg, next.length);
        }

        return next;
      });
    } catch (err) {
      console.error('[ProductReviewsModal] delete error:', err);
      toast.error('Failed to delete review');
    }
  }, [product, onReviewsChanged]);

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      style={{ zIndex: 1000 }}
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        style={{ width: '90%', maxWidth: '640px', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div className="flex-between mb-4">
          <h2 id={titleId} style={{ margin: 0 }}>
            Reviews for {product.name}
          </h2>
          {/* WCAG: receives focus on open via closeBtnRef */}
          <button
            ref={closeBtnRef}
            className="btn-icon"
            onClick={onClose}
            aria-label={`Close reviews for ${product.name}`}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="p-4 text-center text-secondary" role="status" aria-label="Loading reviews">
            Loading reviews…
          </div>
        ) : reviews.length === 0 ? (
          <div className="p-4 text-center text-secondary">
            No reviews for this product yet.
          </div>
        ) : (
          <div
            className="reviews-list"
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            {reviews.map(review => (
              <ReviewCard
                key={review.id}
                review={review}
                onDelete={handleDelete}
                showProductName={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductReviewsModal;
