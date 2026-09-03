/* eslint-disable @typescript-eslint/no-unused-vars */
 
import React, { useState, useEffect } from 'react';
import { formatPHDate } from '../../utils/dateFormatter';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
} from '../../services/announcementService';
import { Plus, Trash2, Megaphone, Bell } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import './Announcements.css';

const Announcements = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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
        created_by: user?.uid || user?.id,
      };
      if (formData.expires_at) {
        payload.expires_at = new Date(formData.expires_at).toISOString();
      }
      await createAnnouncement(payload);
      toast.success('Announcement broadcasted successfully');
      setIsModalOpen(false);
      setFormData({
        title: '',
        body: '',
        type: 'promo',
        expires_at: '',
      });
      fetchAnnouncements();
    } catch (error) {
      toast.error('Failed to create announcement');
    }
  };

  const handleDelete = (id) => {
    setDeleteConfirmId(id);
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteAnnouncement(deleteConfirmId);
      toast.success('Announcement deleted');
      setDeleteConfirmId(null);
      fetchAnnouncements();
    } catch (error) {
      toast.error('Failed to delete announcement');
    }
  };

  const getStatusBadge = (announcement) => {
    if (announcement.expires_at && new Date(announcement.expires_at) < new Date()) {
      return <span className="badge expired">Expired</span>;
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
      <PageHeader
        category="MARKETING & COMMUNICATIONS"
        title="Broadcast Announcements"
        subtitle="Push broadcast messages, promotional alerts, and system notices to mobile users."
        actions={
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> New Broadcast
          </button>
        }
      />

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
                      {announcement.type === 'promo' ? <Megaphone size={12} style={{marginRight: 'var(--spacing-xs)'}} /> : <Bell size={12} style={{marginRight: 'var(--spacing-xs)'}} />}
                      {announcement.type}
                    </span>
                    <span style={{ marginLeft: 8 }}>{getStatusBadge(announcement)}</span>
                  </div>
                </div>
              </div>
              
              <p className="announcement-body">{announcement.body}</p>
              
              <div className="announcement-footer">
                <span className="announcement-meta" style={{ flexGrow: 1 }}>
                  Posted {formatPHDate(announcement.created_at)}
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
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-broadcast-title">
          <div className="modal-content">
            <div className="modal-header">
              <h2 id="modal-broadcast-title">New Broadcast</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)} aria-label="Close modal">
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label className="label" htmlFor="announcement-title">Title *</label>
                <input autoComplete="off"
                  id="announcement-title"
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
                <label className="label" htmlFor="announcement-type">Type</label>
                <select autoComplete="off"
                  id="announcement-type"
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
                <label className="label" htmlFor="announcement-body">Message *</label>
                <textarea autoComplete="off"
                  id="announcement-body"
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
                <label className="label" htmlFor="announcement-expires-at">Expires At (Optional)</label>
                <input autoComplete="off"
                  id="announcement-expires-at"
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

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Announcement"
        message="Are you sure you want to delete this announcement? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};

export default Announcements;
