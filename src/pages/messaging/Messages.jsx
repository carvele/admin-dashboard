import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  Search,
  Send,
  Paperclip,
  Image as ImageIcon,
  Shirt,
  Plus,
  X,
  MessageSquare,
  User,
  Calendar,
  Clock,
  Tag,
  Zap,
  Ruler,
} from 'lucide-react';
import {
  subscribeToConversations,
  subscribeToMessages,
  createConversation,
  updateConversation,
  sendMessage,
  uploadChatImage,
  addReaction,
} from '../../services/communicationService';
import { subscribeToReservations } from '../../services/reservationService';
import { getCustomers } from '../../services/customerService';
import { logAction } from '../../services/staffService';
import { getAvatarColor, getInitials, formatSmartDateTime } from '../../utils/helpers';
import debounce from 'lodash.debounce';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './Messages.css';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// public.messages has no dedicated "reservation summary" column, so the
// structured card data is encoded into `text` behind this marker prefix and
// parsed back out in renderBubble. Keeps the feature working with the real
// schema instead of the nonexistent isReservationSummary/reservationData
// fields the previous code tried to write.
const RESERVATION_CARD_PREFIX = '__RES_CARD__';

const QUICK_REPLY_TEMPLATES = [
  'Reservation confirmed! Please complete your payment to secure your slot.',
  'Reminder: Your pickup is scheduled. Please bring your deposit receipt.',
  'Hi! We have your outfit ready for fitting. See you soon! 😊',
  'Thank you for your reservation. Our store is at [location] — store hours are 10am–7pm.',
];

const formatResDate = (res) => {
  if (!res) return '';
  const d = res.reservationDate?.toDate
    ? res.reservationDate.toDate()
    : res.reservationDate?.seconds
    ? new Date(res.reservationDate.seconds * 1000)
    : res.date?.toDate
    ? res.date.toDate()
    : res.date?.seconds
    ? new Date(res.date.seconds * 1000)
    : res.date || res.reservationDate
    ? new Date(res.date || res.reservationDate)
    : null;
  if (!d || isNaN(d.getTime())) return 'Date N/A';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getResStatusColor = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'confirmed') return '#10b981';
  if (s === 'pending') return '#f59e0b';
  if (s === 'fitting') return '#8b5cf6';
  if (s === 'completed') return '#3b82f6';
  if (s === 'cancelled') return '#ef4444';
  return '#6b7280';
};

const Messages = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [allReservations, setAllReservations] = useState([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState(null);

  // Reaction popover: { msgId, anchorRect }
  const [reactionPopover, setReactionPopover] = useState(null);

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
  const imageInputRef = useRef(null);
  const location = useLocation();
  const autoSendFiredRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const quickReplyRef = useRef(null);
  const attachMenuRef = useRef(null);

  // Close reaction popover & popovers on outside click
  useEffect(() => {
    const handler = (e) => {
      setReactionPopover(null);
      if (quickReplyRef.current && !quickReplyRef.current.contains(e.target)) {
        setShowQuickReplies(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
      // lastMessageTime/updatedAt/createdAt are plain ISO strings from
      // Supabase (not Firestore {seconds} timestamps), so parse with Date.
      const sortedConv = [...data].sort((a, b) => {
        const timeA = Math.max(
          new Date(a.lastMessageTime || a.updatedAt || a.createdAt || 0).getTime(),
        );
        const timeB = Math.max(
          new Date(b.lastMessageTime || b.updatedAt || b.createdAt || 0).getTime(),
        );
        return timeB - timeA;
      });
      setConversations(sortedConv);
      if (sortedConv.length > 0) setActiveChat((prev) => prev || sortedConv[0]);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }
    const convKey = activeChat.customId || activeChat.id;
    const unsub = subscribeToMessages((data) => {
      const filtered = data.filter((m) => m.conversationId === convKey);
      const sorted = [...filtered].sort((a, b) => {
        const tA = new Date(a.createdAt || 0).getTime();
        const tB = new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });
      setMessages(sorted);
    });
    return () => unsub();
  }, [activeChat?.id, activeChat?.customId]);

  // ── Send text ──────────────────────────────────────────────────────────
  // public.messages only has: conversation_id, sender_id, sender_name, text,
  // image_url, created_at, read_at, reactions — no sender/message_type/time
  // columns. Sending those extra keys made every send fail outright.
  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const convKey = activeChat.customId || activeChat.id;
    const nowIso = new Date().toISOString();
    try {
      await sendMessage({
        conversationId: convKey,
        senderId: user?.id ?? null,
        senderName: user?.name ?? user?.email ?? 'Staff',
        text: newMessage,
      });
      await updateConversation(activeChat.docId, {
        lastMessage: newMessage,
        lastMessageTime: nowIso,
      });
      await logAction(user, 'Sent message to customer', { customerName: getConvName(activeChat) });
      setNewMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  // ── Send image ─────────────────────────────────────────────────────────
  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;

    setShowAttachMenu(false);
    setIsUploadingImage(true);

    const convKey = activeChat.customId || activeChat.id;
    const nowIso = new Date().toISOString();

    try {
      const imageUrl = await uploadChatImage(file, convKey);
      await sendMessage({
        conversationId: convKey,
        senderId: user?.id ?? null,
        senderName: user?.name ?? user?.email ?? 'Staff',
        text: '',
        imageUrl,
      });
      await updateConversation(activeChat.docId, {
        lastMessage: '📷 Photo',
        lastMessageTime: nowIso,
      });
      await logAction(user, 'Sent image to customer', { customerName: getConvName(activeChat) });
    } catch (err) {
      console.error('Image send failed:', err);
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  // ── Add reaction ───────────────────────────────────────────────────────
  const handleReaction = async (msg, emoji) => {
    setReactionPopover(null);
    if (!msg.docId) return;
    try {
      await addReaction(msg.docId, user?.uid || 'admin', emoji);
    } catch (err) {
      console.error('Reaction failed:', err);
    }
  };

  // ── Reaction helpers ───────────────────────────────────────────────────
  const getGroupedReactions = (reactions) => {
    if (!reactions) return [];
    const counts = {};
    for (const emoji of Object.values(reactions)) {
      counts[emoji] = (counts[emoji] || 0) + 1;
    }
    return Object.entries(counts);
  };

  // ── New conversation ───────────────────────────────────────────────────
  const loadCustomers = async () => {
    try {
      const users = await getCustomers();
      setAllCustomers(users.filter((u) => !u.role || u.role === 'customer'));
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  // Load the customer list eagerly (not just when the "New Conversation"
  // modal opens) — it's needed to resolve names below, since public.conversations
  // only stores customer_id, no denormalized name column.
  useEffect(() => {
    loadCustomers();
  }, []);

  // ── Resolve a conversation's customer display name ─────────────────────
  // conversations has no customer_name column (only customer_id), so the
  // name must be looked up from the customers list. Without this, every
  // conv.customerName is undefined — which not only shows blank names but
  // silently breaks the sidebar search: `''.includes(anything)` is false,
  // so typing any character wiped out the entire conversation list.
  const customersById = useMemo(() => {
    const map = {};
    allCustomers.forEach((c) => {
      const key = c.docId || c.id;
      if (key) map[key] = c;
    });
    return map;
  }, [allCustomers]);

  const getConvName = useCallback((conv) => {
    if (!conv) return 'Unknown Customer';
    if (conv.customerName) return conv.customerName;
    const cust = customersById[conv.customerId];
    if (!cust) return 'Unknown Customer';
    return (
      cust.name ||
      `${cust.firstName || cust.first_name || ''} ${cust.lastName || cust.last_name || ''}`.trim() ||
      cust.email ||
      'Unknown Customer'
    );
  }, [customersById]);

  // public.conversations only has: customer_id, last_message, last_message_time,
  // unread_count, created_at, updated_at — no customer_name/time/unread columns.
  const startNewConversation = async (customer) => {
    const customerId = customer.docId || customer.id || '';
    const existing = conversations.find((c) => c.customerId === customerId);
    if (existing) {
      setActiveChat(existing);
      setShowNewConvModal(false);
      return;
    }
    try {
      const customerName =
        customer.name ||
        `${customer.firstName || customer.first_name || ''} ${customer.lastName || customer.last_name || ''}`.trim() ||
        customer.email;
      await createConversation({
        customerId,
        lastMessage: 'Conversation started by staff',
        lastMessageTime: new Date().toISOString(),
        unreadCount: 0,
      });
      await logAction(user, 'Started new conversation', { customerName, customerId });
      setShowNewConvModal(false);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  // ── Reservation card auto-send ─────────────────────────────────────────
  const sendReservationCard = useCallback(
    async (conv, resContext) => {
      if (!conv || !resContext) return;
      try {
        const convKey = conv.customId || conv.id;
        await sendMessage({
          conversationId: convKey,
          senderId: user?.id ?? null,
          senderName: user?.name ?? user?.email ?? 'Staff',
          text: RESERVATION_CARD_PREFIX + JSON.stringify(resContext),
        });
        await updateConversation(conv.docId, {
          lastMessage: `📋 Reservation: ${resContext.productName}`,
          lastMessageTime: new Date().toISOString(),
        });
        await logAction(user, 'Sent reservation summary to customer', {
          customerName: getConvName(conv),
          reservationId: resContext.id,
        });
      } catch (err) {
        console.error('Failed to send reservation card:', err);
      }
    },
    [user, getConvName],
  );

  useEffect(() => {
    if (!location.state) return;
    const { buyerId, buyerName, autoSendReservation, reservationContext } = location.state;

    if ((autoSendReservation || location.state.prefillMessage) && conversations.length > 0) {
      if (autoSendFiredRef.current) return;

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
        const customerId = buyerId;
        createConversation({
          customerId,
          lastMessage: 'Conversation started by staff',
          lastMessageTime: new Date().toISOString(),
          unreadCount: 0,
        }).then(() => {
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
          setTimeout(() => clearInterval(waitForConv), 5000);
        });
      }
    }
  }, [location.state, conversations, sendReservationCard]);

  const convKey = activeChat?.customId || activeChat?.id;
  const activeMessages = messages
    .filter((m) => activeChat && m.conversationId === convKey)
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  // ── Message bubble renderer ────────────────────────────────────────────
  const renderBubble = (msg, index) => {
    // messages has no `sender` column — the reliable signal is sender_id.
    // A message is FROM THE CUSTOMER only when sender_id matches this
    // conversation's customer_id; everything else (staff's own id, or null,
    // per how the admin app writes it) is an outgoing/staff message.
    const isSent = msg.senderId !== activeChat?.customerId;
    const groupedReactions = getGroupedReactions(msg.reactions);
    const isReservationCard = typeof msg.text === 'string' && msg.text.startsWith(RESERVATION_CARD_PREFIX);
    const reservationData = isReservationCard
      ? (() => {
          try {
            return JSON.parse(msg.text.slice(RESERVATION_CARD_PREFIX.length));
          } catch {
            return null;
          }
        })()
      : null;
    const msgTime = msg.createdAt
      ? formatSmartDateTime(msg.createdAt, { short: true })
      : '';

    return (
      <div
        key={msg.id || msg.docId || `msg-${index}`}
        className={`message-bubble-wrapper ${isSent ? 'sent' : 'received'}`}
      >
        {!isSent && activeChat && (
          <div
            className="avatar small-av"
            style={{ backgroundColor: getAvatarColor(getConvName(activeChat)) }}
          >
            {getInitials(getConvName(activeChat))[0]}
          </div>
        )}

        <div className="bubble-col">
          {/* Reservation card */}
          {isReservationCard && reservationData ? (
            <div className="message-bubble bubbles-received">
              <div className="reservation-card">
                <div className="res-card-header">
                  <Calendar size={15} />
                  <span>Reservation Summary</span>
                </div>
                {reservationData.imageUrl && (
                  <img
                    src={reservationData.imageUrl}
                    alt={reservationData.productName}
                    className="res-card-img"
                  />
                )}
                <div className="res-card-body">
                  <div className="res-card-product">{reservationData.productName}</div>
                  <div className="res-card-rows">
                    <div className="res-card-row"><Tag size={12} /><span>Size {reservationData.size}</span></div>
                    <div className="res-card-row"><Calendar size={12} /><span>{reservationData.date}</span></div>
                    <div className="res-card-row"><Clock size={12} /><span>{reservationData.time}</span></div>
                  </div>
                  <div className="res-card-status">
                    <span className="res-status-dot" />
                    {reservationData.status}
                  </div>
                  <div className="res-card-deposit">Deposit: {reservationData.deposit}</div>
                </div>
                <div className="res-card-footer">📌 Ref #{reservationData.id?.slice(-6)}</div>
              </div>
              <span className="msg-time">{msgTime}</span>
            </div>

          ) : (
            /* Normal text / image bubble */
            <div
              className={`message-bubble ${isSent ? 'bubbles-sent' : 'bubbles-received'} bubble-hoverable`}
              onMouseEnter={(e) => {
                const btn = e.currentTarget.querySelector('.reaction-trigger');
                if (btn) btn.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget.querySelector('.reaction-trigger');
                if (btn) btn.style.opacity = '0';
              }}
            >
              {/* Image */}
              {msg.imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageModalUrl(msg.imageUrl)}
                  style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block' }}
                  aria-label="View full-size image"
                >
                  <img
                    src={msg.imageUrl}
                    alt="Chat image"
                    className="chat-image-thumb"
                  />
                </button>
              )}

              {/* Text */}
              {msg.text && (
                <p style={{ whiteSpace: 'pre-line', margin: msg.imageUrl ? '6px 0 0' : 0 }}>
                  {msg.text}
                </p>
              )}

              <span className="msg-time">{msgTime}</span>

              {/* Reaction trigger button (visible on hover) */}
              <button
                className="reaction-trigger"
                style={{ opacity: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setReactionPopover((prev) =>
                    prev?.msgId === (msg.id || msg.docId) ? null : { msgId: msg.id || msg.docId, msg }
                  );
                }}
                title="React"
              >
                😊
              </button>

              {/* Inline emoji popover */}
              {reactionPopover?.msgId === (msg.id || msg.docId) && (
                <div
                  className={`emoji-popover ${isSent ? 'popover-left' : 'popover-right'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {EMOJI_LIST.map((emoji) => (
                    <button
                      key={emoji}
                      className="emoji-btn"
                      onClick={() => handleReaction(msg, emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reaction chips */}
          {groupedReactions.length > 0 && (
            <div className={`reaction-chips ${isSent ? 'chips-sent' : 'chips-received'}`}>
              {groupedReactions.map(([emoji, count]) => (
                <span
                  key={emoji}
                  className="reaction-chip"
                  onClick={() => handleReaction(msg, emoji)}
                  title="Click to react"
                >
                  {emoji} {count > 1 ? count : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="messages-layout">
      {/* Hidden file input for image upload */}
      <input
        type="file"
        accept="image/*"
        ref={imageInputRef}
        style={{ display: 'none' }}
        onChange={handleImageFileChange}
      />

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
              getConvName(conv).toLowerCase().includes(convSearchTerm.toLowerCase()),
            )
            .map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${activeChat?.id === conv.id ? 'active' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}`}
                onClick={() => {
                  setActiveChat(conv);
                  if (conv.unreadCount > 0) {
                    updateConversation(conv.docId, { unreadCount: 0 });
                  }
                }}
              >
                <div
                  className="avatar"
                  style={{ backgroundColor: getAvatarColor(getConvName(conv)) }}
                >
                  {getConvName(conv).split(' ').map((n) => n[0]).join('')}
                </div>
                <div className="conv-details">
                  <div className="conv-header">
                    <h4>{getConvName(conv)}</h4>
                    <span className="time">
                      {conv.lastMessageTime
                        ? formatSmartDateTime(conv.lastMessageTime, { short: true })
                        : ''}
                    </span>
                  </div>
                  <div className="conv-preview">
                    <p>{conv.lastMessage}</p>
                    {conv.unreadCount > 0 && <span className="unread-badge">{conv.unreadCount}</span>}
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
              const activeChatName = getConvName(activeChat);
              const activeRes = allReservations.find(
                (r) =>
                  r.customerId === activeChat?.customerId ||
                  (r.customerName || r.customer) === activeChatName,
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
              const statusColor =
                { pending: '#f59e0b', confirmed: '#10b981', fitting: '#8b5cf6' }[
                  (activeRes.status || '').toLowerCase()
                ] || '#6b7280';
              return (
                <div className="reservation-banner">
                  <div className="res-banner-dot" style={{ background: statusColor }} />
                  <div className="res-banner-info">
                    <strong>{activeRes.productName || activeRes.outfit}</strong>
                    <span>
                      Size {activeRes.size} ·{' '}
                      {resDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} ·{' '}
                      {resDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <span
                    className="res-banner-badge"
                    style={{ background: statusColor + '22', color: statusColor }}
                  >
                    {(activeRes.status || '').toUpperCase()}
                  </span>
                </div>
              );
            })()}

            <div className="chat-header">
              <div className="flex-center gap-3">
                <div
                  className="avatar"
                  style={{ backgroundColor: getAvatarColor(getConvName(activeChat)) }}
                >
                  {getConvName(activeChat).split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <h3>{getConvName(activeChat)}</h3>
                  <p className="status-text online">● Active</p>
                </div>
              </div>
              <button
                className="btn-outline small flex-center gap-2"
                onClick={() =>
                  navigate(`/customers?search=${encodeURIComponent(getConvName(activeChat))}`)
                }
              >
                <User size={14} /> View Profile
              </button>
            </div>

            <div className="chat-history">
              {activeMessages.map((msg, index) => {
                const msgDate = new Date(msg.createdAt || Date.now());
                const prevMsg = activeMessages[index - 1];
                const prevDate = prevMsg ? new Date(prevMsg.createdAt || Date.now()) : null;
                const showDivider = !prevDate || msgDate.toDateString() !== prevDate.toDateString();

                return (
                  <React.Fragment key={msg.id || msg.docId || `msg-${index}`}>
                    {showDivider && (
                      <div className="chat-date-divider">
                        <span>{formatSmartDateTime(msgDate).split(' ')[0]}</span>
                      </div>
                    )}
                    {renderBubble(msg, index)}
                  </React.Fragment>
                );
              })}
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
            <div style={{ padding: '1.5rem', borderRadius: '50%', background: 'var(--surface-hover)' }}>
              <MessageSquare size={48} strokeWidth={1} style={{ opacity: 0.5 }} />
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No conversation selected</h3>
            <p className="text-secondary" style={{ maxWidth: 280 }}>
              Select a conversation from the sidebar, or start a new one to begin messaging.
            </p>
          </div>
        )}

        {/* Input area */}
        <div className="chat-input-area">
          {isUploadingImage && (
            <div className="upload-progress">
              <span>📤 Uploading image...</span>
            </div>
          )}
          <form onSubmit={handleSend} className="chat-form">
            <div className="quick-reply-wrapper" ref={quickReplyRef}>
              <button
                type="button"
                className="icon-btn qr-icon-btn"
                aria-label="Quick reply templates"
                onClick={() => {
                  setShowQuickReplies(!showQuickReplies);
                  setShowAttachMenu(false);
                }}
                title="Quick reply templates"
              >
                <Zap size={20} />
              </button>

              {showQuickReplies && (
                <div className="quick-reply-popover">
                  {QUICK_REPLY_TEMPLATES.map((template, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="quick-reply-btn"
                      onClick={() => {
                        setNewMessage(template);
                        setShowQuickReplies(false);
                      }}
                    >
                      {template}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="attach-wrapper" ref={attachMenuRef}>
              <button
                type="button"
                className="icon-btn"
                aria-label="Attach file"
                onClick={() => {
                  setShowAttachMenu(!showAttachMenu);
                  setShowQuickReplies(false);
                  setShowEmojiPicker(false);
                }}
              >
                <Paperclip size={20} />
              </button>

              {showAttachMenu && (
                <div className="attach-menu card">
                  <button
                    type="button"
                    className="attach-item"
                    onClick={() => {
                      setShowAttachMenu(false);
                      imageInputRef.current?.click();
                    }}
                  >
                    <ImageIcon size={16} /> Send Image
                  </button>
                </div>
              )}
            </div>

            <div className="relative" style={{ position: 'relative' }}>
              <button
                type="button"
                className="icon-btn"
                aria-label="Insert Emoji"
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowAttachMenu(false);
                  setShowQuickReplies(false);
                }}
                title="Insert Emoji"
                style={{ fontSize: '1.1rem' }}
              >
                😊
              </button>

              {showEmojiPicker && (
                <div
                  className="card p-2 flex gap-2"
                  style={{
                    position: 'absolute',
                    bottom: '45px',
                    left: 0,
                    zIndex: 100,
                    display: 'flex',
                    flexWrap: 'wrap',
                    maxWidth: '220px',
                    background: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    borderRadius: '8px',
                    padding: '8px',
                  }}
                >
                  {['😊', '❤️', '👍', '✨', '👗', '🎉', '🙏', '🔥', '😂', '😮', '😢', '😍'].map((e) => (
                    <button
                      key={e}
                      type="button"
                      style={{ border: 'none', background: 'none', fontSize: '1.25rem', cursor: 'pointer', padding: '4px' }}
                      onClick={() => {
                        setNewMessage((prev) => prev + e);
                        setShowEmojiPicker(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
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

            <button type="submit" className="send-btn" aria-label="Send message" disabled={!newMessage.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* Customer Context Sidebar */}
      <div className="context-panel card">
        <div className="context-panel-header">
          <h3>Customer Context</h3>
        </div>

        {activeChat ? (
          <div className="context-panel-body">
            {/* Customer Avatar & Name */}
            <div className="context-customer-info">
              <div
                className="avatar large-av"
                style={{ backgroundColor: getAvatarColor(getConvName(activeChat)) }}
              >
                {getInitials(getConvName(activeChat))}
              </div>
              <h4 className="context-customer-name">{getConvName(activeChat)}</h4>
              <button
                className="btn-outline small full-width flex-center gap-2 mt-2"
                onClick={() =>
                  navigate(`/customers?search=${encodeURIComponent(getConvName(activeChat))}`)
                }
              >
                <User size={14} /> View Profile
              </button>
            </div>

            <hr className="context-divider" />

            {/* Active Reservations */}
            <div className="context-section">
              <h4 className="context-section-title">Active Reservations</h4>
              {(() => {
                const customerResList = allReservations.filter(
                  (r) =>
                    r.customerId === activeChat.customerId ||
                    (r.customerName || r.customer) === getConvName(activeChat)
                );
                if (customerResList.length === 0) {
                  return (
                    <p className="text-secondary text-sm" style={{ margin: '0.25rem 0' }}>
                      No active reservations
                    </p>
                  );
                }
                return customerResList.map((res, index) => {
                  const statusColor = getResStatusColor(res.status);
                  const dep = res.deposit || res.depositAmount;
                  const bal = res.balance || res.balanceAmount;
                  const depStr = dep ? (String(dep).startsWith('₱') ? dep : `₱${dep}`) : '₱0';
                  const balStr = bal ? (String(bal).startsWith('₱') ? bal : `₱${bal}`) : '₱0';
                  return (
                    <div key={res.id || res.docId || `res-${index}`} className="context-res-item">
                      <div className="context-res-name">
                        {res.productName || res.outfit || 'Outfit Reservation'}
                      </div>
                      <div className="context-res-status">
                        <span
                          className="context-res-dot"
                          style={{ backgroundColor: statusColor }}
                        />
                        <span style={{ color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>
                          {res.status || 'Pending'}
                        </span>
                      </div>
                      <div className="context-res-date">
                        <Calendar size={12} />
                        <span>{formatResDate(res)}</span>
                      </div>
                      <div className="context-res-finance">
                        Deposit: {depStr} · Balance: {balStr}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <hr className="context-divider" />

            {/* Fit Profile */}
            <div className="context-section">
              <h4 className="context-section-title">Fit Profile</h4>
              <p className="context-fit-note">
                Body measurements available in Customer Profile
              </p>
              <button
                className="btn-outline small full-width flex-center gap-2 mt-2"
                onClick={() =>
                  navigate(`/customers?search=${encodeURIComponent(getConvName(activeChat))}`)
                }
              >
                <Ruler size={14} /> View Customer Profile
              </button>
            </div>
          </div>
        ) : (
          <div className="context-panel-empty">
            <User size={36} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
            <p className="text-secondary text-sm text-center">
              Select a conversation to view customer context
            </p>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
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
                    const name = (c.name || `${c.firstName || ''} ${c.lastName || ''}`).toLowerCase();
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
                            `${c.firstName || ''} ${c.lastName || ''}`.trim() ||
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

      {imageModalUrl && (
        <div className="modal-overlay" onClick={() => setImageModalUrl(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', width: 'auto', padding: '1rem' }}
          >
            <div className="modal-header">
              <h3>Image</h3>
              <button className="btn-icon" onClick={() => setImageModalUrl(null)} aria-label="Close image">
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', maxHeight: '75vh', overflow: 'auto' }}>
              <img
                src={imageModalUrl}
                alt="Full size chat attachment"
                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
