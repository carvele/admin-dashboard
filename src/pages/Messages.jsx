import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Search, Send, Paperclip, CheckSquare, Image as ImageIcon, Shirt, Plus, X, MessageSquare } from 'lucide-react';
import { subscribeToCollection, addDocument, updateDocument, logAction, getCollection } from '../firebase/firestore';
import { getAvatarColor } from '../utils/helpers';
import './Messages.css';

const Messages = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [convSearchTerm, setConvSearchTerm] = useState('');
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);
  const [custSearchTerm, setCustSearchTerm] = useState('');
  const messagesEndRef = useRef(null);
  const location = useLocation();
  
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
    // Filter messages by active conversation
    if (!activeChat) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToCollection('messages', (data) => {
      const filtered = data.filter(m => m.conversationId === activeChat.id);
      const sorted = [...filtered].sort((a,b) => (a.id > b.id ? 1 : -1));
      setMessages(sorted);
    });
    return () => unsub();
  }, [activeChat?.id]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    try {
      await addDocument('messages', {
        id: Date.now(),
        conversationId: activeChat.id,
        sender: 'staff',
        text: newMessage,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      });
      await updateDocument('conversations', activeChat.docId, {
        lastMessage: newMessage,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      });
      await logAction(user, 'Sent message to customer', { customerName: activeChat.customerName });
      setNewMessage('');
    } catch(err) {
      console.error(err);
    }
  };

  const loadCustomers = async () => {
    try {
      const users = await getCollection('users');
      setAllCustomers(users.filter(u => !u.role || u.role === 'customer'));
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const startNewConversation = async (customer) => {
    const existing = conversations.find(c => c.customerName === (customer.name || customer.first_name));
    if (existing) {
      setActiveChat(existing);
      setShowNewConvModal(false);
      return;
    }
    try {
      const customerName = customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || customer.email;
      const customerId = customer.docId || customer.id || '';
      const convId = await addDocument('conversations', {
        id: `conv_${Date.now()}`,
        customerName,
        customerId, // FK to users collection
        lastMessage: 'Conversation started by staff',
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        unread: 0
      });
      await logAction(user, 'Started new conversation', { customerName, customerId });
      setShowNewConvModal(false);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  useEffect(() => {
    if (location.state?.prefillMessage && conversations.length > 0) {
      const { buyerId, buyerName, prefillMessage } = location.state;
      const existing = conversations.find(c => c.customerId === buyerId || c.customerName === buyerName);
      
      if (existing) {
        setActiveChat(existing);
        setNewMessage(prefillMessage);
        window.history.replaceState({}, document.title);
      } else {
        // Conversation doesn't exist, create it via existing function
        startNewConversation({ name: buyerName, id: buyerId }).then(() => {
          setNewMessage(prefillMessage);
          window.history.replaceState({}, document.title);
        });
      }
    }
  }, [location.state, conversations]);

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
            <input type="text" placeholder="Search conversations..." className="input-field pl-10" value={convSearchTerm} onChange={(e) => setConvSearchTerm(e.target.value)} />
          </div>
          <button className="btn-primary full-width mt-2 flex-center gap-2" onClick={() => { setShowNewConvModal(true); loadCustomers(); }}>
            <Plus size={16} /> New Conversation
          </button>
        </div>
        
        <div className="conversation-list">
          {conversations
            .filter(conv => (conv.customerName || '').toLowerCase().includes(convSearchTerm.toLowerCase()))
            .map(conv => (
            <div 
              key={conv.id} 
              className={`conversation-item ${activeChat?.id === conv.id ? 'active' : ''} ${conv.unread > 0 ? 'unread' : ''}`}
              onClick={() => {
                setActiveChat(conv);
                if (conv.unread > 0) {
                  updateDocument('conversations', conv.docId, { unread: 0 });
                }
              }}
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
        {activeChat ? (
          <>
            <div className="chat-header">
              <div className="flex-center gap-3">
                <div className="avatar" style={{backgroundColor: getAvatarColor(activeChat.customerName || 'User')}}>
                  {(activeChat.customerName || 'User').split(' ').map(n=>n[0]).join('')}
                </div>
                <div>
                  <h3>{activeChat.customerName}</h3>
                  <p className="status-text online">● Online</p>
                </div>
              </div>
              <button className="btn-outline small flex-center gap-2" disabled={!activeChat}>View Profile</button>
            </div>

            <div className="chat-history">
              {activeMessages.map((msg, index) => (
                <div key={msg.id || msg.docId || `msg-${index}`} className={`message-bubble-wrapper ${msg.sender === 'staff' ? 'sent' : 'received'}`}>
                  {msg.sender === 'customer' && activeChat && (
                    <div className="avatar small-av" style={{backgroundColor: getAvatarColor(activeChat.customerName || 'User')}}>
                      {getInitials(activeChat.customerName || 'User')[0]}
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
                    <span className="msg-time">{msg.time || (msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '')}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'1rem', padding:'2rem', textAlign:'center'}}>
            <div style={{padding:'1.5rem', borderRadius:'50%', background:'var(--surface-hover)'}}>
              <MessageSquare size={48} strokeWidth={1} style={{opacity:0.5}} />
            </div>
            <h3 style={{fontSize:'1.1rem', fontWeight:600}}>No conversation selected</h3>
            <p className="text-secondary" style={{maxWidth:280}}>Select a conversation from the sidebar, or start a new one to begin messaging.</p>
          </div>
        )}

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

      {/* ===== NEW CONVERSATION MODAL ===== */}
      {showNewConvModal && (
        <div className="modal-overlay" onClick={() => setShowNewConvModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: 420}}>
            <div className="modal-header">
              <h2>Start New Conversation</h2>
              <button className="close-btn" onClick={() => setShowNewConvModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="search-box full-width mb-3">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Search customers by name or email..." className="input-field pl-10" value={custSearchTerm} onChange={(e) => setCustSearchTerm(e.target.value)} />
              </div>
              <div style={{maxHeight: 300, overflowY: 'auto'}}>
                {allCustomers
                  .filter(c => {
                    const name = (c.name || `${c.first_name || ''} ${c.last_name || ''}`).toLowerCase();
                    const email = (c.email || '').toLowerCase();
                    return name.includes(custSearchTerm.toLowerCase()) || email.includes(custSearchTerm.toLowerCase());
                  })
                  .map(c => (
                    <div key={c.id} className="conversation-item" style={{cursor: 'pointer'}} onClick={() => startNewConversation(c)}>
                      <div className="avatar" style={{backgroundColor: getAvatarColor(c.name || c.email || 'U')}}>
                        {(c.name || c.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="conv-details">
                        <h4>{c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown'}</h4>
                        <p className="text-secondary text-sm">{c.email}</p>
                      </div>
                    </div>
                  ))}
                {allCustomers.length === 0 && <p className="text-secondary text-center py-4">No customers found</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
