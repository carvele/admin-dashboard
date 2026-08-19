import React, { useState, useEffect, useCallback } from 'react';
import { X, Star, Trash2, CheckCircle } from 'lucide-react';
import { getProductReviews, deleteReview } from '../../services/reviewService';
import { updateProduct } from '../../services/productService';
import { toast } from 'sonner';
import ConfirmDialog from '../../components/ConfirmDialog';

const ProductReviewsModal = ({ product, onClose, onReviewsChanged }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewToDelete, setReviewToDelete] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedReviews = await getProductReviews(product.docId || product.id);
      setReviews(fetchedReviews);
    } catch (err) {
      console.error('Error fetching reviews:', err);
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleDeleteConfirm = async () => {
    if (!reviewToDelete) return;
    try {
      await deleteReview(reviewToDelete);
      toast.success('Review deleted');

      const newReviews = reviews.filter(r => r.docId !== reviewToDelete);
      setReviews(newReviews);

      // Recalculate product average rating
      const sum = newReviews.reduce((acc, r) => acc + (r.rating || 0), 0);
      const avg = newReviews.length > 0 ? sum / newReviews.length : 0;

      await updateProduct(product.docId || product.id, {
        rating: avg,
        reviewCount: newReviews.length,
      });

      if (onReviewsChanged) {
        onReviewsChanged(product.docId || product.id, avg, newReviews.length);
      }
    } catch (err) {
      console.error('Error deleting review', err);
      toast.error('Failed to delete review');
    } finally {
      setReviewToDelete(null);
    }
  };

  const renderStars = (rating) =>
    Array.from({ length: 5 }).map((_, idx) => (
      <Star
        key={idx}
        size={14}
        fill={idx < rating ? 'var(--warning)' : 'none'}
        color={idx < rating ? 'var(--warning)' : 'var(--text-secondary)'}
      />
    ));

  return (
    <>
      <div className="modal-overlay" role="presentation" onClick={onClose} style={{ zIndex: 1000 }}>
        <div
          className="modal-content"
          role="dialog"
          aria-modal="true"
          aria-label={`Reviews for ${product.name}`}
          onClick={e => e.stopPropagation()}
          style={{ width: '90%', maxWidth: '640px', maxHeight: '80vh', overflowY: 'auto' }}
        >
          <div className="flex-between mb-4">
            <h2 style={{ margin: 0 }}>Reviews for {product.name}</h2>
            <button className="btn-icon" onClick={onClose} aria-label="Close reviews">
              <X size={20} />
            </button>
          </div>

          {loading ? (
            <div className="p-4 text-center text-secondary">Loading reviews...</div>
          ) : reviews.length === 0 ? (
            <div className="p-4 text-center text-secondary">No reviews for this product yet.</div>
          ) : (
            <div className="reviews-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {reviews.map(review => (
                <div
                  key={review.docId}
                  className="review-card"
                  style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                >
                  {/* Header: author + delete */}
                  <div className="flex-between mb-2">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                      {review.displayName}
                      {review.verifiedPurchase && (
                        <CheckCircle size={14} style={{ color: 'var(--success)' }} title="Verified Purchase" />
                      )}
                    </div>
                    <button
                      className="btn-icon"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setReviewToDelete(review.docId)}
                      title="Delete Review"
                      aria-label={`Delete review by ${review.displayName}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Stars + date */}
                  <div className="flex align-center gap-1 mb-2">
                    {renderStars(review.rating)}
                    <span style={{ fontWeight: 'bold', marginLeft: '4px' }}>{review.rating?.toFixed(1)}</span>
                    <span className="text-secondary ml-2" style={{ fontSize: '0.85rem' }}>
                      {review.timestamp ? new Date(review.timestamp).toLocaleDateString() : ''}
                    </span>
                  </div>

                  {/* Review text */}
                  {review.reviewText && (
                    <p style={{ margin: '0 0 0.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                      {review.reviewText}
                    </p>
                  )}

                  {/* Review images */}
                  {review.images && review.images.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {review.images.map((img, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedImage(img)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          aria-label={`View image ${idx + 1}`}
                        >
                          <img
                            src={img}
                            alt={`Review image ${idx + 1}`}
                            style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full-size image preview */}
      {selectedImage && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
          role="button"
          tabIndex={0}
          aria-label="Close image preview"
          onClick={() => setSelectedImage(null)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedImage(null); }}
        >
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
            <button
              onClick={() => setSelectedImage(null)}
              style={{ position: 'absolute', top: -12, right: -12, background: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Close image"
            >
              <X size={16} />
            </button>
            <img src={selectedImage} alt="Full resolution review" style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: '8px' }} />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!reviewToDelete}
        title="Delete Review"
        message="Are you sure you want to delete this review? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setReviewToDelete(null)}
      />
    </>
  );
};

export default ProductReviewsModal;
