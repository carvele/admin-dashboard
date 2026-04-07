import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Search,
  Send,
  Paperclip,
  CheckSquare,
  Image as ImageIcon,
  Shirt,
  Plus,
  X,
  MessageSquare,
  User,
  Calendar,
  Clock,
  Tag,
  ChevronRight,
} from 'lucide-react';
import {
  subscribeToConversations,
  subscribeToMessages,
  createConversation,
  updateConversation,
  sendMessage,
} from '../../services/communicationService';
import { subscribeToReservations } from '../../services/reservationService';
import { getCustomers } from '../../services/customerService';
import { logAction } from '../../services/staffService';
import { getAvatarColor, getInitials } from '../../utils/helpers';
import debounce from 'lodash.debounce';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './Messages.css';

const Messages = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [allReservations, setAllReservations] = useState([]);
  
  const [convSearchInput, setConvSearchInput] = useState('');
  const [convSearchTerm, setConvSearchTerm] = useState('');
  const debouncedConvSearch = useCallback(
    debounce((val) => setConvSearchTerm(val), 300),
    []
  );
  
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);
  
  const [custSearchInput, setCustSearchInput] = useState('');
  const [custSearchTerm, setCustSearchTerm] = useState('');
  const debouncedCustSearch = useCallback(
    debounce((val) => setCustSearchTerm(val), 300),
    []
  );
  const messagesEndRef = useRef(null);
  const location = useLocation();
  const autoSendFiredRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Subscribe to all active reservations for the banner
  useEffect(() => {
    const unsub = subscribeToReservations((data) => {
      const active = data.filter((r) => {
        const s = (r.status || '').toLowerCase();
        return s === 'pending' || s === 'confirmed' || s === 'fitting';
      });
      setAllReservations(active);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeToConversations((data) => {
      // Sort by the latest timestamp (updatedAt from new messages or createdAt)
      const sortedConv = [...data].sort((a, b) => {
        const timeA = Math.max(a.updatedAt?.seconds || 0, a.createdAt?.seconds || 0);
        const timeB = Math.max(b.updatedAt?.seconds || 0, b.createdAt?.seconds || 0);
        return timeB - timeA; // Descending (newest first)
      });
      setConversations(sortedConv);
      if (sortedConv.length > 0) setActiveChat((prev) => prev || sortedConv[0]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Filter messages by active conversation
    if (!activeChat) {
      setMessages([]);
      return;
    }
    // Use customId (the 'conv_...' string) for filtering — Android sets this as conversationId on messages
    const convKey = activeChat.customId || activeChat.id;
    const unsub = subscribeToMessages((data) => {
      const filtered = data.filter((m) => m.conversationId === convKey);
      const sorted = [...filtered].sort((a, b) => {
        const tA = a.createdAt?.seconds || a.customId || 0;
        const tB = b.createdAt?.seconds || b.customId || 0;
        return tA > tB ? 1 : -1;
      });
      setMessages(sorted);
    });
    return () => unsub();
  }, [activeChat?.id, activeChat?.customId]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    try {
      // Use the custom conv_ ID so Android can find this message via .whereEqualTo("conversationId", convId)
      const convKey = activeChat.customId || activeChat.id;
      await sendMessage({
        id: Date.now(),
        conversationId: convKey,
        sender: 'staff',
        text: newMessage,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      // sendMessage auto-adds createdAt — needed for Android's .orderBy("createdAt")
      await updateConversation(activeChat.docId, {
        lastMessage: newMessage,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      await logAction(user, 'Sent message to customer', { customerName: activeChat.customerName });
      setNewMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  const loadCustomers = async () => {
    try {
      const users = await getCustomers();
      setAllCustomers(users.filter((u) => !u.role || u.role === 'customer'));
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const startNewConversation = async (customer) => {
    const existing = conversations.find(
      (c) =>
        c.customerName ===
        (customer.name ||
          customer.first_name ||
          `${customer.first_name || ''} ${customer.last_name || ''}`.trim()),
    );
    if (existing) {
      setActiveChat(existing);
      setShowNewConvModal(false);
      return;
    }
    try {
      const customerName =
        customer.name ||
        `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
        customer.email;
      const customerId = customer.docId || customer.id || '';
      const convId = await createConversation({
        id: `conv_${Date.now()}`,
        customerName,
        customerId, // FK to users collection
        lastMessage: 'Conversation started by staff',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unread: 0,
      });
      await logAction(user, 'Started new conversation', { customerName, customerId });
      setShowNewConvModal(false);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  // Sends a formatted reservation card as a message
  const sendReservationCard = useCallback(async (conv, resContext) => {
    if (!conv || !resContext) return;
    try {
      const convKey = conv.customId || conv.id;
      await sendMessage({
        id: Date.now(),
        conversationId: convKey,
        sender: 'staff',
        isReservationSummary: true,
        reservationData: resContext,
        text: `Reservation Summary: ${resContext.productName} on ${resContext.date}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      await updateConversation(conv.docId, {
        lastMessage: `📋 Reservation: ${resContext.productName}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        updatedAt: new Date(),
      });
      await logAction(user, 'Sent reservation summary to customer', {
        customerName: conv.customerName,
        reservationId: resContext.id,
      });
    } catch (err) {
      console.error('Failed to send reservation card:', err);
    }
  }, [user]);

  useEffect(() => {
    if (!location.state) return;
    const { buyerId, buyerName, autoSendReservation, reservationContext } = location.state;

    // Handle both auto-send and plain prefill cases
    if ((autoSendReservation || location.state.prefillMessage) && conversations.length > 0) {
      if (autoSendFiredRef.current) return; // prevent double-fire

      const existing = conversations.find(
        (c) => c.customerId === buyerId || c.customerName === buyerName,
      );

      const proceed = async (conv) => {
        setActiveChat(conv);
        autoSendFiredRef.current = true;
        if (autoSendReservation && reservationContext) {
          await sendReservationCard(conv, reservationContext);
        } else if (location.state.prefillMessage) {
          setNewMessage(location.state.prefillMessage);
        }
        window.history.replaceState({}, document.title);
      };

      if (existing) {
        proceed(existing);
      } else {
        // Create conversation then send
        const customerName = buyerName;
        const customerId = buyerId;
        createConversation({
          id: `conv_${Date.now()}`,
          customerName,
          customerId,
          lastMessage: 'Conversation started by staff',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          unread: 0,
        }).then(() => {
          // Wait for the subscription to pick up the new conversation
          const waitForConv = setInterval(() => {
            setConversations((prev) => {
              const found = prev.find(
                (c) => c.customerId === buyerId || c.customerName === buyerName,
              );
              if (found) {
                clearInterval(waitForConv);
                proceed(found);
              }
              return prev;
            });
          }, 300);
          // Clear interval after 5s failsafe
          setTimeout(() => clearInterval(waitForConv), 5000);
        });
      }
    }
  }, [location.state, conversations, sendReservationCard]);

  // Filter messages for active chat and sort by time
  // Use customId (the conv_ string) for filtering — matches what Android writes as conversationId
  const convKey = activeChat?.customId || activeChat?.id;
  const activeMessages = messages
    .filter((m) => activeChat && m.conversationId === convKey)
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
            <input
              type="text"
              placeholder="Search conversations..."
              className="input-field pl-10"
              value={convSearchInput}
              onChange={(e) => {
                setConvSearchInput(e.target.value);
                debouncedConvSearch(e.target.value);
              }}
            />
          </div>
          <button
            className="btn-primary full-width mt-2 flex-center gap-2"
            onClick={() => {
              setShowNewConvModal(true);
              loadCustomers();
            }}
          >
            <Plus size={16} /> New Conversation
          </button>
        </div>

        <div className="conversation-list">
          {conversations
            .filter((conv) =>
              (conv.customerName || '').toLowerCase().includes(convSearchTerm.toLowerCase()),
            )
            .map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${activeChat?.id === conv.id ? 'active' : ''} ${conv.unread > 0 ? 'unread' : ''}`}
                onClick={() => {
                  setActiveChat(conv);
                  if (conv.unread > 0) {
                    updateConversation(conv.docId, { unread: 0 });
                  }
                }}
              >
                <div
                  className="avatar"
                  style={{ backgroundColor: getAvatarColor(conv.customerName || 'User') }}
                >
                  {(conv.customerName || 'User')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
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
            {/* Active Reservation Banner */}
            {(() => {
              const activeRes = allReservations.find(
                (r) =>
                  r.customerId === activeChat?.customerId ||
                  (r.customerName || r.customer) === activeChat?.customerName,
              );
              if (!activeRes) return null;
              const resDate = activeRes.reservationDate?.toDate
                ? activeRes.reservationDate.toDate()
                : activeRes.reservationDate?.seconds
                ? new Date(activeRes.reservationDate.seconds * 1000)
                : activeRes.date?.toDate
                ? activeRes.date.toDate()
                : activeRes.date?.seconds
                ? new Date(activeRes.date.seconds * 1000)
                : new Date(activeRes.date);
              const statusColor = {
                pending: '#f59e0b',
                confirmed: '#10b981',
                fitting: '#8b5cf6',
              }[(activeRes.status || '').toLowerCase()] || '#6b7280';
              return (
                <div className="reservation-banner">
                  <div className="res-banner-dot" style={{ background: statusColor }} />
                  <div className="res-banner-info">
                    <strong>{activeRes.productName || activeRes.outfit}</strong>
                    <span>Size {activeRes.size} · {resDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · {resDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <span className="res-banner-badge" style={{ background: statusColor + '22', color: statusColor }}>
                    {(activeRes.status || '').toUpperCase()}
                  </span>
                </div>
              );
            })()}

            <div className="chat-header">
              <div className="flex-center gap-3">
                <div
                  className="avatar"
                  style={{ backgroundColor: getAvatarColor(activeChat.customerName || 'User') }}
                >
                  {(activeChat.customerName || 'User')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div>
                  <h3>{activeChat.customerName}</h3>
                  <p className="status-text online">● Active</p>
                </div>
              </div>
              <button
                className="btn-outline small flex-center gap-2"
                onClick={() =>
                  navigate(`/customers?search=${encodeURIComponent(activeChat.customerName || '')}`)
                }
              >
                <User size={14} /> View Profile
              </button>
            </div>

            <div className="chat-history">
              {activeMessages.map((msg, index) => (
                <div
                  key={msg.id || msg.docId || `msg-${index}`}
                  className={`message-bubble-wrapper ${msg.sender === 'staff' ? 'sent' : 'received'}`}
                >
                  {msg.sender === 'customer' && activeChat && (
                    <div
                      className="avatar small-av"
                      style={{ backgroundColor: getAvatarColor(activeChat.customerName || 'User') }}
                    >
                      {getInitials(activeChat.customerName || 'User')[0]}
                    </div>
                  )}
                  <div
                    className={`message-bubble ${msg.sender === 'staff' ? 'bubbles-sent' : 'bubbles-received'}`}
                  >
                    {msg.isReservationSummary && msg.reservationData ? (
                      <div className="reservation-card">
                        <div className="res-card-header">
                          <Calendar size={15} />
                          <span>Reservation Summary</span>
                        </div>
                        {msg.reservationData.imageUrl && (
                          <img
                            src={msg.reservationData.imageUrl}
                            alt={msg.reservationData.productName}
                            className="res-card-img"
                          />
                        )}
                        <div className="res-card-body">
                          <div className="res-card-product">{msg.reservationData.productName}</div>
                          <div className="res-card-rows">
                            <div className="res-card-row"><Tag size={12} /><span>Size {msg.reservationData.size}</span></div>
                            <div className="res-card-row"><Calendar size={12} /><span>{msg.reservationData.date}</span></div>
                            <div className="res-card-row"><Clock size={12} /><span>{msg.reservationData.time}</span></div>
                          </div>
                          <div className="res-card-status">
                            <span className="res-status-dot" />
                            {msg.reservationData.status}
                          </div>
                          <div className="res-card-deposit">Deposit: {msg.reservationData.deposit}</div>
                        </div>
                        <div className="res-card-footer">📌 Ref #{msg.reservationData.id?.slice(-6)}</div>
                      </div>
                    ) : msg.isOutfitSuggestion ? (
                      <div className="outfit-suggestion-card">
                        <div className="os-icon">
                          <Shirt size={20} />
                        </div>
                        <div className="os-info">
                          <strong>Outfit Suggestion: Midnight Gala</strong>
                          <button className="btn-primary small mt-2">View Details</button>
                        </div>
                      </div>
                    ) : (
                      <p style={{ whiteSpace: 'pre-line' }}>{msg.text}</p>
                    )}
                    <span className="msg-time">
                      {msg.time ||
                        (msg.createdAt?.seconds
                          ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '')}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: '1rem',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <div
              style={{ padding: '1.5rem', borderRadius: '50%', background: 'var(--surface-hover)' }}
            >
              <MessageSquare size={48} strokeWidth={1} style={{ opacity: 0.5 }} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No conversation selected</h3>
            <p className="text-secondary" style={{ maxWidth: 280 }}>
              Select a conversation from the sidebar, or start a new one to begin messaging.
            </p>
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
                    <Shirt size={16} /> Suggest Outfit
                  </button>
                  <button type="button" className="attach-item">
                    <ImageIcon size={16} /> Send Image
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
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <div className="modal-header">
              <h2>Start New Conversation</h2>
              <button className="close-btn" onClick={() => setShowNewConvModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="search-box full-width mb-3">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search customers by name or email..."
                  className="input-field pl-10"
                  value={custSearchInput}
                  onChange={(e) => {
                    setCustSearchInput(e.target.value);
                    debouncedCustSearch(e.target.value);
                  }}
                />
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {allCustomers
                  .filter((c) => {
                    const name = (
                      c.name || `${c.first_name || ''} ${c.last_name || ''}`
                    ).toLowerCase();
                    const email = (c.email || '').toLowerCase();
                    return (
                      name.includes(custSearchTerm.toLowerCase()) ||
                      email.includes(custSearchTerm.toLowerCase())
                    );
                  })
                  .map((c) => (
                    <div
                      key={c.id}
                      className="conversation-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => startNewConversation(c)}
                    >
                      <div
                        className="avatar"
                        style={{ backgroundColor: getAvatarColor(c.name || c.email || 'U') }}
                      >
                        {(c.name || c.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="conv-details">
                        <h4>
                          {c.name ||
                            `${c.first_name || ''} ${c.last_name || ''}`.trim() ||
                            'Unknown'}
                        </h4>
                        <p className="text-secondary text-sm">{c.email}</p>
                      </div>
                    </div>
                  ))}
                {allCustomers.length === 0 && (
                  <p className="text-secondary text-center py-4">No customers found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
