import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from '../../services/announcementService';
import { Plus, Trash2, Megaphone, Bell } from 'lucide-react';
import './Announcements.css';

const Announcements = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    type: 'promo',
    expires_at: '',
  });

  const fetchAnnouncements = async () => {
    try {
      setIsLoading(true);
      const data = await getAnnouncements();
      setAnnouncements(data);
    } catch (error) {
      toast.error('Failed to load announcements');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const payload = {
        title: formData.title,
        body: formData.body,
        type: formData.type,
        created_by: user.uid,
      };
      
      if (formData.expires_at) {
        payload.expires_at = new Date(formData.expires_at).toISOString();
      }

      await createAnnouncement(payload);
      toast.success('Announcement broadcasted successfully');
      setIsModalOpen(false);
      setFormData({ title: '', body: '', type: 'promo', expires_at: '' });
      fetchAnnouncements();
    } catch (error) {
      toast.error('Failed to create announcement');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this announcement?')) return;
    
    try {
      await deleteAnnouncement(id);
      toast.success('Announcement deleted');
      fetchAnnouncements();
    } catch (error) {
      toast.error('Failed to delete announcement');
    }
  };

  const getStatusBadge = (announcement) => {
    if (announcement.expires_at) {
      const isExpired = new Date(announcement.expires_at) < new Date();
      if (isExpired) {
        return <span className="badge expired">Expired</span>;
      }
    }
    return <span className="badge active">Active</span>;
  };

  if (isLoading) {
    return (
      <div className="flex-center-vh">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="announcements-page">
      <div className="announcements-header">
        <h1>Broadcast Announcements</h1>
        <button className="create-btn" onClick={() => setIsModalOpen(true)}>
          <Plus size={20} />
          New Broadcast
        </button>
      </div>

      {announcements.length === 0 ? (
        <div className="empty-state">
          <p>No announcements found.</p>
        </div>
      ) : (
        <div className="announcements-grid">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="announcement-card">
              <div className="announcement-header">
                <div>
                  <h3 className="announcement-title">{announcement.title}</h3>
                  <div className="announcement-meta">
                    <span className={`badge ${announcement.type}`}>
                      {announcement.type === 'promo' ? <Megaphone size={12} style={{marginRight: 4}} /> : <Bell size={12} style={{marginRight: 4}} />}
                      {announcement.type}
                    </span>
                    <span style={{ marginLeft: 8 }}>{getStatusBadge(announcement)}</span>
                  </div>
                </div>
              </div>
              
              <p className="announcement-body">{announcement.body}</p>
              
              <div className="announcement-footer">
                <span className="announcement-meta" style={{ flexGrow: 1 }}>
                  Posted {new Date(announcement.created_at).toLocaleDateString()}
                </span>
                <button 
                  className="delete-btn"
                  onClick={() => handleDelete(announcement.id)}
                  title="Delete Announcement"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>New Broadcast</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label className="label">Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="input-field"
                  placeholder="E.g., Summer Sale is Live!"
                  required
                />
              </div>

              <div className="form-group">
                <label className="label">Type</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleInputChange}
                  className="input-field"
                >
                  <option value="promo">Promotion</option>
                  <option value="system">System / Alert</option>
                </select>
              </div>

              <div className="form-group">
                <label className="label">Message *</label>
                <textarea
                  name="body"
                  value={formData.body}
                  onChange={handleInputChange}
                  className="input-field"
                  style={{ minHeight: 110, resize: 'vertical' }}
                  placeholder="Type the announcement message..."
                  required
                />
              </div>

              <div className="form-group">
                <label className="label">Expires At (Optional)</label>
                <input
                  type="datetime-local"
                  name="expires_at"
                  value={formData.expires_at}
                  onChange={handleInputChange}
                  className="input-field"
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Broadcast Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Announcements;
