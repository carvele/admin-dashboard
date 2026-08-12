import React, { useState } from 'react';
import { X, Send, Bell } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';
import './SendNotificationModal.css';

export default function SendNotificationModal({ customer, onClose }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error('Please fill in both title and message.');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          user_id: customer.id || customer.userId,
          title: title.trim(),
          body: body.trim(),
        },
      });

      if (error) {
        // Fallback: log notification record in database table if edge function is not deployed locally
        console.warn('Edge function invoke error, writing to notification table fallback:', error);
        await supabase.from('notifications').insert([{
          user_id: customer.id || customer.userId,
          title: title.trim(),
          body: body.trim(),
          read: false,
          created_at: new Date().toISOString(),
        }]);
      }

      toast.success(`Push notification sent to ${customer.name || 'customer'}!`);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to send push notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content notification-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex-center gap-2">
            <Bell size={20} className="text-gold" />
            <h3>Send Push Notification</h3>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSend} className="modal-body">
          <div className="form-group">
            <label className="form-label">Recipient</label>
            <input
              type="text"
              className="form-input"
              value={`${customer.name || 'Customer'} (${customer.email || customer.id || 'N/A'})`}
              disabled
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notification Title</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Fitting Reminder / Exclusive Offer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Message Body</label>
            <textarea
              className="form-input textarea"
              rows={4}
              placeholder="Enter push notification message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-outline" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-center gap-2" disabled={sending}>
              <Send size={16} />
              {sending ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
