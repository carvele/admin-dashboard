import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { getAllReviews, deleteReview } from '../../services/reviewService';
import { Filter } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import ReviewCard from '../../components/ReviewCard';
import './Reviews.css';

const Reviews = () => {
  const [reviews, setReviews]     = useState([]);
  const [count, setCount]         = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const [page, setPage]               = useState(1);
  const [ratingFilter, setRatingFilter] = useState('');
  const [searchQuery, setSearchQuery]   = useState('');

  const limit = 20;

  const fetchReviews = useCallback(async () => {
    try {
      setIsLoading(true);
      const rating = ratingFilter ? parseInt(ratingFilter, 10) : null;
      const { reviews: data, count: total } = await getAllReviews(page, limit, rating, searchQuery);
      setReviews(data);
      setCount(total);
    } catch {
      toast.error('Failed to load reviews');
    } finally {
      setIsLoading(false);
    }
  }, [page, ratingFilter, searchQuery]);

  // Debounce so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(fetchReviews, 500);
    return () => clearTimeout(timer);
  }, [fetchReviews]);

  /** Called by ReviewCard after the user confirms deletion. */
  const handleDelete = useCallback(async (reviewId) => {
    try {
      await deleteReview(reviewId);
      toast.success('Review deleted');
      fetchReviews(); // Re-fetch current page (handles edge-case of last item on page)
    } catch {
      toast.error('Failed to delete review');
    }
  }, [fetchReviews]);

  return (
    <div className="reviews-page">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Review Moderation' }]}
        category="CATALOG & REVIEWS"
        title="Review Moderation Center"
        subtitle="Filter, moderate, and inspect customer reviews across catalog items."
      />

      <div className="filter-controls-panel mb-6">
        <div className="filter-controls-header">
          <Filter size={16} aria-hidden="true" />
          <span>Filter Controls</span>
        </div>
        <div className="filters-bar">
          <input autoComplete="off"
            id="search-reviews"
            name="search-reviews"
            type="text"
            placeholder="Search by product name."
            className="filter-input"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            aria-label="Search reviews by product name"
          />
          <select autoComplete="off" id="field_le6bem1" name="field_le6bem1"
            className="filter-select"
            value={ratingFilter}
            onChange={e => { setRatingFilter(e.target.value); setPage(1); }}
            aria-label="Filter by star rating"
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

        {isLoading && reviews.length === 0 ? (
        <div className="flex-center-vh">
          <div className="loading-spinner" role="status" aria-label="Loading reviews" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="empty-state">
          <p>No reviews found matching your criteria.</p>
        </div>
      ) : (
        <>
          <div className="reviews-grid">
            {reviews.map(review => (
              <ReviewCard
                key={review.id}
                review={review}
                onDelete={handleDelete}
                showProductName
              />
            ))}
          </div>

          <div className="pagination" role="navigation" aria-label="Review pages">
            <button
              className="pagination-btn"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              aria-label="Previous page"
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
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Reviews;
