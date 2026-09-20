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
import { Plus, Trash2, Megaphone, Bell, Store } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import './Announcements.css';

const Announcements = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    type: 'promo',
    expires_at: '',
    placement: 'inbox',
    storefront_image_url: '',
    cta_label: '',
    cta_target_type: 'none',
    cta_target_value: '',
  });

  const fetchAnnouncements = async () => {
    try {
      setIsLoading(true);
      const data = await getAnnouncements(51);
      setHasMore(data.length > 50);
      setAnnouncements(data.slice(0, 50));
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
        placement: formData.placement,
        storefront_image_url: formData.storefront_image_url.trim() || null,
        cta_label: formData.cta_label.trim() || null,
        cta_target_type: formData.cta_target_type,
        cta_target_value: formData.cta_target_type === 'none' ? null : formData.cta_target_value.trim() || null,
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
        placement: 'inbox',
        storefront_image_url: '',
        cta_label: '',
        cta_target_type: 'none',
        cta_target_value: '',
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
        title="Announcements & Storefront"
        subtitle="Send Inbox broadcasts or publish a campaign directly on the mobile storefront."
        actions={
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Create announcement
          </button>
        }
      />

      {hasMore && (
        <div style={{ padding: '8px 16px', marginBottom: '16px', background: 'var(--surface-muted, #f1f5f9)', borderRadius: '6px', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
          Showing the 50 most recent announcements.
        </div>
      )}

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
                    {announcement.placement && announcement.placement !== 'inbox' && (
                      <span className="badge promo" style={{ marginLeft: 8 }}><Store size={12} style={{ marginRight: 'var(--spacing-xs)' }} /> Storefront</span>
                    )}
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
              <h2 id="modal-broadcast-title">Create announcement</h2>
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
                <label className="label" htmlFor="announcement-placement">Where should it appear?</label>
                <select
                  id="announcement-placement"
                  name="placement"
                  value={formData.placement}
                  onChange={handleInputChange}
                  className="input-field"
                >
                  <option value="inbox">Inbox notification only</option>
                  <option value="storefront">Mobile storefront only</option>
                  <option value="both">Inbox notification and storefront</option>
                </select>
              </div>

              {formData.placement !== 'inbox' && (
                <>
                  <div className="form-group">
                    <label className="label" htmlFor="announcement-image">Campaign image URL (optional)</label>
                    <input
                      id="announcement-image"
                      type="url"
                      name="storefront_image_url"
                      value={formData.storefront_image_url}
                      onChange={handleInputChange}
                      className="input-field"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="label" htmlFor="announcement-action">Campaign destination</label>
                    <select id="announcement-action" name="cta_target_type" value={formData.cta_target_type} onChange={handleInputChange} className="input-field">
                      <option value="none">No link</option>
                      <option value="catalog">Open all products</option>
                      <option value="category">Open a category</option>
                      <option value="product">Open a product</option>
                    </select>
                  </div>
                  {formData.cta_target_type !== 'none' && formData.cta_target_type !== 'catalog' && (
                    <div className="form-group">
                      <label className="label" htmlFor="announcement-target">{formData.cta_target_type === 'product' ? 'Product ID' : 'Category name'}</label>
                      <input id="announcement-target" type="text" name="cta_target_value" value={formData.cta_target_value} onChange={handleInputChange} className="input-field" required />
                    </div>
                  )}
                  {formData.cta_target_type !== 'none' && (
                    <div className="form-group">
                      <label className="label" htmlFor="announcement-cta">Button label (optional)</label>
                      <input id="announcement-cta" type="text" name="cta_label" value={formData.cta_label} onChange={handleInputChange} className="input-field" placeholder="Shop collection" />
                    </div>
                  )}
                </>
              )}

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
                  Publish announcement
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
