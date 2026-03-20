import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Search, Send, Paperclip, CheckSquare, Image as ImageIcon, Shirt } from 'lucide-react';
import { subscribeToCollection, addDocument, logAction } from '../firebase/firestore';
import { getAvatarColor } from '../utils/helpers';
import './Messages.css';

const Messages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const unsub = subscribeToCollection('conversations', (data) => {
      setConversations(data);
      if (data.length > 0) setActiveChat(prev => prev || data[0]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // In a real app, query by conversationId. Here we just load all messages for demonstration.
    const unsub = subscribeToCollection('messages', (data) => {
      // Sort messages to ensure consistent order if they have createdAt
      const sorted = [...data].sort((a,b) => (a.id > b.id ? 1 : -1));
      setMessages(sorted);
    });
    return () => unsub();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    try {
      await addDocument('messages', {
        id: messages.length + 1,
        conversationId: activeChat.id,
        sender: 'staff',
        text: newMessage,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      });
      await logAction(user, 'Sent message to customer', { customerName: activeChat.customerName });
      setNewMessage('');
    } catch(err) {
      console.error(err);
    }
  };

  // Filter messages for active chat and sort by time
  const activeMessages = messages
    .filter(m => activeChat && m.conversationId === activeChat.id)
    .sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeA - timeB;
    });

  return (
    <div className="messages-layout">
      {/* Sidebar Conversation List */}
      <div className="messages-sidebar card">
        <div className="ms-header">
          <h2>Messages</h2>
          <div className="search-box full-width mt-3">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search conversations..." className="input-field pl-10" />
          </div>
        </div>
        
        <div className="conversation-list">
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={`conversation-item ${activeChat?.id === conv.id ? 'active' : ''} ${conv.unread > 0 ? 'unread' : ''}`}
              onClick={() => setActiveChat(conv)}
            >
              <div className="avatar" style={{backgroundColor: getAvatarColor(conv.customerName || 'User')}}>
                {(conv.customerName || 'User').split(' ').map(n=>n[0]).join('')}
              </div>
              <div className="conv-details">
                <div className="conv-header">
                  <h4>{conv.customerName}</h4>
                  <span className="time">{conv.time}</span>
                </div>
                <div className="conv-preview">
                  <p>{conv.lastMessage}</p>
                  {conv.unread > 0 && <span className="unread-badge">{conv.unread}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-area card">
        <div className="chat-header">
          {activeChat ? (
            <div className="flex-center gap-3">
              <div className="avatar" style={{backgroundColor: getAvatarColor(activeChat.customerName || 'User')}}>
                {(activeChat.customerName || 'User').split(' ').map(n=>n[0]).join('')}
              </div>
              <div>
                <h3>{activeChat.customerName}</h3>
                <p className="status-text online">● Online</p>
              </div>
            </div>
          ) : (
            <div>Loading...</div>
          )}
          <button className="btn-outline small flex-center gap-2" disabled={!activeChat}>View Profile</button>
        </div>

        <div className="chat-history">
          {activeMessages.map((msg, index) => (
            <div key={msg.id || msg.docId || `msg-${index}`} className={`message-bubble-wrapper ${msg.sender === 'staff' ? 'sent' : 'received'}`}>
              {msg.sender === 'customer' && activeChat && (
                <div className="avatar small-av" style={{backgroundColor: getAvatarColor(activeChat.customerName || 'User')}}>
                  {(activeChat.customerName || 'U')[0]}
                </div>
              )}
              <div className={`message-bubble ${msg.sender === 'staff' ? 'bubbles-sent' : 'bubbles-received'}`}>
                {msg.isOutfitSuggestion ? (
                  <div className="outfit-suggestion-card">
                    <div className="os-icon"><Shirt size={20} /></div>
                    <div className="os-info">
                      <strong>Outfit Suggestion: Midnight Gala</strong>
                      <button className="btn-primary small mt-2">View Details</button>
                    </div>
                  </div>
                ) : (
                  <p>{msg.text}</p>
                )}
                <span className="msg-time">{msg.time}</span>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <form onSubmit={handleSend} className="chat-form">
            <div className="attach-wrapper">
              <button 
                type="button" 
                className="icon-btn" 
                onClick={() => setShowAttachMenu(!showAttachMenu)}
              >
                <Paperclip size={20} />
              </button>
              
              {showAttachMenu && (
                <div className="attach-menu card">
                  <button type="button" className="attach-item">
                    <Shirt size={16}/> Suggest Outfit
                  </button>
                  <button type="button" className="attach-item">
                    <ImageIcon size={16}/> Send Image
                  </button>
                </div>
              )}
            </div>
            
            <input 
              type="text" 
              className="input-field chat-input" 
              placeholder="Type your message..." 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            
            <button type="submit" className="send-btn" disabled={!newMessage.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Messages;
