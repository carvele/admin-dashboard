import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getAllReviews, deleteReview } from '../../services/reviewService';
import { Star, CheckCircle, Trash2, X, Filter } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';
import './Reviews.css';

const Reviews = () => {
  const [reviews, setReviews] = useState([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedImage, setSelectedImage] = useState(null);
  const [reviewToDelete, setReviewToDelete] = useState(null);
  
  const limit = 20;

  const fetchReviews = async () => {
    try {
      setIsLoading(true);
      const rating = ratingFilter ? parseInt(ratingFilter) : null;
      const { reviews: data, count: total } = await getAllReviews(page, limit, rating, searchQuery);
      setReviews(data);
      setCount(total);
    } catch {
      toast.error('Failed to load reviews');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchReviews();
    }, 500); // Debounce search

    return () => clearTimeout(delayDebounceFn);
  }, [page, ratingFilter, searchQuery]);

  const handleDeleteConfirm = async () => {
    if (!reviewToDelete) return;
    try {
      await deleteReview(reviewToDelete);
      toast.success('Review deleted');
      fetchReviews(); // Refresh current page
    } catch {
      toast.error('Failed to delete review');
    } finally {
      setReviewToDelete(null);
    }
  };

  const renderStars = (rating) => {
    return Array.from({ length: 5 }).map((_, idx) => (
      <Star 
        key={idx} 
        size={16} 
        className={`star ${idx < rating ? 'filled' : 'empty'}`}
        fill={idx < rating ? 'currentColor' : 'none'}
      />
    ));
  };

  return (
    <div className="reviews-page">
      <div className="reviews-header">
        <h1>Review Moderation Center</h1>
        <div className="filter-controls-panel">
          <div className="filter-controls-header">
            <Filter size={16} />
            <span>Filter Controls</span>
          </div>
          <div className="filters-bar">
            <input 
              type="text" 
              placeholder="Search by product name..." 
              className="filter-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1); // reset to first page on search
              }}
            />
            <select 
              className="filter-select"
              value={ratingFilter}
              onChange={(e) => {
                setRatingFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && reviews.length === 0 ? (
        <div className="flex-center-vh">
          <div className="loading-spinner"></div>
        </div>
      ) : reviews.length === 0 ? (
        <div className="empty-state">
          <p>No reviews found matching your criteria.</p>
        </div>
      ) : (
        <>
          <div className="reviews-grid">
            {reviews.map((review) => (
              <div key={review.id} className="review-card">
                <div className="review-header">
                  <div>
                    <div className="review-author">
                      {review.userName}
                      {review.verifiedPurchase && (
                        <CheckCircle size={14} className="verified-badge" title="Verified Purchase" />
                      )}
                    </div>
                    <div className="review-product">Product: {review.productName}</div>
                  </div>
                  <div className="stars">
                    {renderStars(review.rating)}
                  </div>
                </div>
                
                <p className="review-body">{review.comment}</p>
                
                {review.images && review.images.length > 0 && (
                  <div className="review-images">
                    {review.images.map((img, idx) => (
                      <img 
                        key={idx} 
                        src={img} 
                        alt="Review attachment" 
                        className="review-thumb"
                        onClick={() => setSelectedImage(img)}
                      />
                    ))}
                  </div>
                )}
                
                <div className="review-footer">
                  <span className="review-date">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                  <button 
                    className="delete-btn"
                    onClick={() => setReviewToDelete(review.id)}
                    title="Delete Review"
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pagination">
            <button 
              className="pagination-btn"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <span className="pagination-info">
              Page {page} of {Math.ceil(count / limit) || 1} ({count} total)
            </span>
            <button 
              className="pagination-btn"
              disabled={page >= Math.ceil(count / limit)}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}

      {selectedImage && (
        <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="image-modal-content" onClick={e => e.stopPropagation()}>
            <button className="image-modal-close" onClick={() => setSelectedImage(null)}>
              <X size={24} />
            </button>
            <img src={selectedImage} alt="Full resolution" className="image-modal-img" />
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
    </div>
  );
};

export default Reviews;
