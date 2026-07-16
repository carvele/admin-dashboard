import React, { useState, useEffect } from 'react';
import { X, Star, Trash2 } from 'lucide-react';
import { getProductReviews, deleteReview } from '../../services/reviewService';
import { updateProduct } from '../../services/productService';
import { toast } from 'sonner';

const ProductReviewsModal = ({ product, onClose, onReviewsChanged }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, [product]);

  const fetchReviews = async () => {
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
  };

  const handleDelete = async (reviewDocId) => {
    if (!window.confirm("Are you sure you want to delete this review?")) return;
    
    try {
      await deleteReview(reviewDocId);
      toast.success('Review deleted');
      
      const newReviews = reviews.filter(r => r.docId !== reviewDocId);
      setReviews(newReviews);
      
      // Update product average rating
      let sum = 0;
      newReviews.forEach(r => { sum += (r.rating || 0); });
      const avg = newReviews.length > 0 ? sum / newReviews.length : 0;
      
      await updateProduct(product.docId || product.id, {
        rating: avg,
        reviewCount: newReviews.length
      });
      
      if (onReviewsChanged) {
        onReviewsChanged(product.docId || product.id, avg, newReviews.length);
      }
    } catch (err) {
      console.error('Error deleting review', err);
      toast.error('Failed to delete review');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}
      >
        <div className="flex-between mb-4">
          <h2 style={{ margin: 0 }}>Reviews for {product.name}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {loading ? (
          <div className="p-4 text-center text-secondary">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="p-4 text-center text-secondary">No reviews for this product yet.</div>
        ) : (
          <div className="reviews-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {reviews.map(review => (
              <div key={review.docId} className="review-card" style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                <div className="flex-between mb-2">
                  <div style={{ fontWeight: 600 }}>{review.displayName}</div>
                  <button 
                    className="btn-icon" 
                    style={{ color: 'var(--danger)' }} 
                    onClick={() => handleDelete(review.docId)}
                    title="Delete Review"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex align-center gap-1 mb-2">
                  <Star size={14} fill="var(--warning)" color="var(--warning)" />
                  <span style={{ fontWeight: 'bold' }}>{review.rating?.toFixed(1)}</span>
                  <span className="text-secondary ml-2" style={{ fontSize: '0.85rem' }}>
                    {review.timestamp ? new Date(review.timestamp).toLocaleDateString() : ''}
                  </span>
                </div>
                {review.reviewText && (
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                    {review.reviewText}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductReviewsModal;
