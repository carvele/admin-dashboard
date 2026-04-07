import React, { useState, useEffect } from 'react';
import { Search, Star, MessageSquarePlus, Trash2, Filter } from 'lucide-react';
import { subscribeToFeedbacks, deleteFeedback } from '../../services/feedbackService';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import SkeletonTable from '../../components/SkeletonTable';
import './Feedbacks.css';

const parseDate = (d) => {
  if (!d) return new Date();
  if (d.toDate) return d.toDate();
  if (d.seconds) return new Date(d.seconds * 1000);
  return new Date(d);
};

const Feedbacks = () => {
  const { isAdminUnlocked } = useAuth();
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [ratingFilter, setRatingFilter] = useState('All');

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToFeedbacks((data) => {
      setFeedbacks(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleDelete = async (feedbackId) => {
    if (!window.confirm("Are you sure you want to delete this feedback?")) return;
    
    try {
      await deleteFeedback(feedbackId);
      toast.success("Feedback deleted successfully");
    } catch (e) {
      toast.error("Failed to delete feedback");
    }
  };

  const filteredFeedbacks = feedbacks.filter((fb) => {
    // Search
    const searchString = `${fb.userName || ''} ${fb.email || ''} ${fb.message || ''}`.toLowerCase();
    if (searchTerm && !searchString.includes(searchTerm.toLowerCase())) return false;
    
    // Category Filter
    if (categoryFilter !== 'All' && fb.category !== categoryFilter) return false;
        
    // Rating Filter
    if (ratingFilter !== 'All' && fb.rating !== parseInt(ratingFilter)) return false;
    
    return true;
  });

  const uniqueCategories = [...new Set(feedbacks.map(f => f.category).filter(Boolean))];

  return (
    <div className="page-container feedbacks-page">
      <div className="page-header d-flex justify-between align-center">
        <div>
          <h1 className="page-title">Feedback & Suggestions</h1>
          <p className="page-subtitle">View and manage customer feedback from the mobile app</p>
        </div>
      </div>

      <div className="feedbacks-toolbar card">
        <div className="search-box p-4" style={{ flexGrow: 1, maxWidth: '400px' }}>
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, email or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        
        <div className="feedbacks-filters p-4">
          <div className="flex-center gap-2">
            <Filter size={16} className="text-secondary" />
            <select
              className="input-field"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="All">All Categories</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-center gap-2">
            <Star size={16} className="text-secondary" />
            <select
              className="input-field"
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
            >
              <option value="All">All Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-4">
          <SkeletonTable columns={4} rows={3} />
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="feedback-empty-state">
          <MessageSquarePlus size={48} />
          <h3>No feedback found</h3>
          <p>We couldn't find any feedback matching your current filters.</p>
        </div>
      ) : (
        <div className="feedbacks-grid">
          {filteredFeedbacks.map((fb) => (
            <div key={fb.id} className="feedback-card">
              <div className="feedback-header">
                <div className="feedback-user-info">
                  <span className="feedback-user-name">{fb.userName || 'Anonymous User'}</span>
                  {fb.email && <span className="feedback-user-email">{fb.email}</span>}
                </div>
                {fb.category && (
                  <span className="feedback-category-badge">{fb.category}</span>
                )}
              </div>
              
              <div className="feedback-rating">
                {[...Array(5)].map((_, index) => (
                  <Star 
                    key={index} 
                    size={16} 
                    fill={index < (fb.rating || 0) ? "currentColor" : "none"} 
                    color={index < (fb.rating || 0) ? "currentColor" : "#ccc"} 
                  />
                ))}
              </div>
              
              <div className="feedback-message">
                {fb.message || <span className="text-secondary italic">No message provided.</span>}
              </div>
              
              <div className="feedback-footer">
                <span className="feedback-timestamp">
                  {parseDate(fb.timestamp).toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric', 
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
                {isAdminUnlocked && (
                  <button 
                    className="feedback-delete-btn" 
                    title="Delete Feedback"
                    onClick={() => handleDelete(fb.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Feedbacks;
