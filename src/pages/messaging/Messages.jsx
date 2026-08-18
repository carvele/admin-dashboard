import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  Search,
  Send,
  Paperclip,
  Image as ImageIcon,
  Plus,
  X,
  MessageSquare,
  User,
  Calendar,
  Clock,
  Tag,
  Zap,
  ShoppingBag,
  Bell,
  Pencil,
  Check,
  CheckCheck,
  ChevronLeft,
  Info,
} from 'lucide-react';
import SendNotificationModal from '../../components/SendNotificationModal';
import {
  subscribeToConversations,
  subscribeToMessages,
  createConversation,
  updateConversation,
  sendMessage,
  editMessage,
  uploadChatImage,
  addReaction,
  markMessagesRead,
  markMessagesDelivered,
} from '../../services/communicationService';
import { usePresence } from '../../hooks/usePresence';
import { subscribeToReservations } from '../../services/reservationService';
import { getCustomers } from '../../services/customerService';
import { logAction } from '../../services/staffService';
import { getAvatarColor, getInitials, formatSmartDateTime } from '../../utils/helpers';
import debounce from 'lodash.debounce';
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
  // Kept in sync below so the messages-subscription callback (which only
  // re-subscribes when activeChat changes) always sees the current
  // conversation list rather than a stale one captured at mount.
  const conversationsRef = useRef([]);
  conversationsRef.current = conversations;
  const [activeChat, setActiveChat] = useState(null);
  // Below the 1024px breakpoint only one of the three panels (conversation
  // list / chat / customer context) shows at a time -- there's no room for
  // all three side by side. Ignored above that width, where CSS shows all
  // three regardless of this value.
  const [mobileView, setMobileView] = useState('list');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [allReservations, setAllReservations] = useState([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState(null);
  // Clicking a sent bubble reveals its exact Sent/Delivered/Seen time, same
  // as the mobile app's tap-to-reveal -- id of the currently expanded one.
  const [expandedMsgId, setExpandedMsgId] = useState(null);

  // Reaction popover: { msgId, anchorRect }
  const [reactionPopover, setReactionPopover] = useState(null);

  // Editing: { docId, text } for the message currently being edited, or null.
  const [editingMsg, setEditingMsg] = useState(null);

  const onlineUsers = usePresence(user?.uid, (user?.role || 'staff').toLowerCase());
  const [otherTyping, setOtherTyping] = useState(false);
  const typingChannelRef = useRef(null);
  const otherTypingTimeoutRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const [convSearchInput, setConvSearchInput] = useState('');
  const [convSearchTerm, setConvSearchTerm] = useState('');
  // debounce(...) only closes over the stable setConvSearchTerm setter, so an
  // empty dep array is correct; eslint can't statically verify that through
  // the debounce() call wrapper.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedConvSearch = useCallback(
    debounce((val) => setConvSearchTerm(val), 300),
    []
  );

  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [allCustomers, setAllCustomers] = useState([]);

  const [custSearchInput, setCustSearchInput] = useState('');
  const [custSearchTerm, setCustSearchTerm] = useState('');
  // debounce(...) only closes over the stable setCustSearchTerm setter, so an
  // empty dep array is correct; eslint can't statically verify that through
  // the debounce() call wrapper.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const [productPreviews, setProductPreviews] = useState({});
  const productPreviewsRef = useRef({});
  productPreviewsRef.current = productPreviews;

  // Fetch product details for messages with contextType === 'product'
  useEffect(() => {
    const missing = [
      ...new Set(
        messages
          .filter((m) => m.contextType === 'product' && m.contextRef)
          .map((m) => m.contextRef)
      ),
    ].filter((id) => productPreviewsRef.current[id] === undefined);

    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('products')
          .select('id, name, price, sale_price, on_sale, image_url, category, tags')
          .in('id', missing);

        if (cancelled) return;

        setProductPreviews((prev) => {
          const next = { ...prev };
          for (const id of missing) next[id] = null;
          for (const item of data || []) {
            next[item.id] = {
              id: item.id,
              name: item.name,
              price: item.price,
              salePrice: item.sale_price,
              onSale: item.on_sale,
              imageUrl: item.image_url,
              category: item.category,
              tags: item.tags,
            };
          }
          return next;
        });
      } catch (err) {
        console.error('Error fetching product previews for chat:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages]);

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
    const convKey = activeChat.id || activeChat.customId;
    const unsub = subscribeToMessages((data) => {
      const filtered = data.filter((m) => m.conversationId === convKey);
      const sorted = [...filtered].sort((a, b) => {
        const tA = new Date(a.createdAt || 0).getTime();
        const tB = new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });
      setMessages(sorted);
      // Marks the customer's messages as read, the other half of the mobile
      // app's markAsRead. Without this a customer's "Sent" checkmark never
      // became "Seen" -- staff opening or replying never touched read_at,
      // only the unrelated conversations.unread_count. Runs on every update
      // (not just on open) so a message the customer sends while staff
      // already has the conversation open still gets marked read once it
      // lands, not only on the next open/close.
      if (activeChat.customerId) {
        markMessagesRead(convKey, activeChat.customerId);
      }

      // Delivered, across every conversation, not just the active one --
      // subscribeToMessages already delivers the full table on every change
      // (it's what `data` is), so this is the one place that sees a customer
      // message the instant any staff browser tab receives it, regardless
      // of which conversation they have open. Mirrors the mobile app's
      // global markDelivered handler on its own presence/messages channel.
      const customerIds = new Set(conversationsRef.current.map((c) => c.customerId).filter(Boolean));
      const undeliveredCustomerMsgIds = data
        .filter((m) => !m.deliveredAt && m.senderId && customerIds.has(m.senderId))
        .map((m) => m.id);
      if (undeliveredCustomerMsgIds.length > 0) {
        markMessagesDelivered(undeliveredCustomerMsgIds);
      }
    });
    return () => unsub();
    // Deliberately depends on the specific fields used, not the whole
    // activeChat object -- a parent re-render can hand this a new object
    // reference for the same conversation, and resubscribing on every such
    // reference change (vs. an actual field change) would tear down and
    // recreate the message subscription far more often than needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.id, activeChat?.customId, activeChat?.customerId]);

  // Typing indicator: ephemeral broadcast on a per-conversation channel, not
  // a DB write. The mobile app joins the exact same channel name/shape
  // ('typing:<conversationId>', event 'typing', payload { sender_id }) when
  // it has this conversation open, so typing is visible across both apps.
  useEffect(() => {
    setOtherTyping(false);
    if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
    if (!activeChat) {
      typingChannelRef.current = null;
      return;
    }
    const convKey = activeChat.id || activeChat.customId;
    const channel = supabase.channel(`typing:${convKey}`);
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.sender_id === user?.uid) return;
        setOtherTyping(true);
        if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
        otherTypingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 4000);
      })
      .subscribe();
    typingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
    };
    // Same reasoning as the message-subscription effect above: depends on
    // the specific fields used, not activeChat's object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat?.id, activeChat?.customId, user?.uid]);

  // Throttled so every keystroke doesn't open a broadcast -- one every 2s is
  // plenty to keep the other side's "typing..." indicator alive.
  const handleMessageInputChange = (val) => {
    setNewMessage(val);
    if (editingMsg) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender_id: user?.uid },
    });
  };

  // ── Send text ──────────────────────────────────────────────────────────
  // public.messages only has: conversation_id, sender_id, sender_name, text,
  // image_url, created_at, read_at, reactions — no sender/message_type/time
  // columns. Sending those extra keys made every send fail outright.
  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    if (editingMsg) return handleSaveEdit();

    const convKey = activeChat.id || activeChat.customId;
    const nowIso = new Date().toISOString();
    const senderDisplayName = (user?.name && user.name !== 'Staff') ? user.name : 'Boutique Support';
    try {
      await sendMessage({
        conversationId: convKey,
        senderId: user?.uid ?? null,
        senderName: senderDisplayName,
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

    const convKey = activeChat.id || activeChat.customId;
    const nowIso = new Date().toISOString();
    const senderDisplayName = (user?.name && user.name !== 'Staff') ? user.name : 'Boutique Support';

    try {
      const imageUrl = await uploadChatImage(file, convKey);
      await sendMessage({
        conversationId: convKey,
        senderId: user?.uid ?? null,
        senderName: senderDisplayName,
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

  // ── Edit message ───────────────────────────────────────────────────────
  // Sender-only, text-only, and never a reservation summary card -- mirrors
  // the mobile app's canEdit so both sides agree on what "editable" means.
  const canEditMsg = (msg) =>
    msg.senderId === user?.uid &&
    !!msg.text &&
    !msg.text.startsWith(RESERVATION_CARD_PREFIX) &&
    !msg.imageUrl;

  const beginEdit = (msg) => {
    if (!canEditMsg(msg)) return;
    setReactionPopover(null);
    setEditingMsg({ docId: msg.docId || msg.id, text: msg.text });
    setNewMessage(msg.text);
  };

  const cancelEdit = () => {
    setEditingMsg(null);
    setNewMessage('');
  };

  const handleSaveEdit = async () => {
    if (!editingMsg) return;
    const nextText = newMessage.trim();
    if (!nextText) return;
    if (nextText === editingMsg.text) {
      cancelEdit();
      return;
    }
    try {
      await editMessage(editingMsg.docId, nextText);
      await logAction(user, 'Edited message to customer', { customerName: getConvName(activeChat) });
    } catch (err) {
      console.error('Edit failed:', err);
    } finally {
      setEditingMsg(null);
      setNewMessage('');
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
      setMobileView('chat');
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
        const convKey = conv.id || conv.customId;
        await sendMessage({
          conversationId: convKey,
          senderId: user?.uid ?? null,
          senderName: user?.name ?? user?.email ?? 'Boutique Support',
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
        setMobileView('chat');
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
        }).then((newConv) => {
          if (newConv) {
            // Use the returned conversation directly
            proceed(newConv);
          } else {
            // Conversation created but not returned inline — the Realtime
            // subscription on `conversations` will deliver it shortly.
            // Check once after a short delay as a fallback.
            setTimeout(() => {
              setConversations((prev) => {
                const found = prev.find(
                  (c) => c.customerId === buyerId || c.customerName === buyerName,
                );
                if (found) proceed(found);
                return prev;
                });
            }, 1000);
          }
        });
      }
    }
  }, [location.state, conversations, sendReservationCard]);

  const convKey = activeChat?.id || activeChat?.customId;
  const activeMessages = messages
    .filter((m) => activeChat && m.conversationId === convKey)
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());

  // Only staff's newest sent message carries a status by default -- repeating
  // Sent/Delivered/Seen down the whole thread is noise, matching the mobile
  // app. Any individual message's status is still one click away.
  const lastSentIndex = (() => {
    for (let i = activeMessages.length - 1; i >= 0; i--) {
      if (activeMessages[i].senderId !== activeChat?.customerId) return i;
    }
    return -1;
  })();

  // ── Message bubble renderer ────────────────────────────────────────────
  const renderBubble = (msg, index) => {
    const isAutoResponse = Boolean(
      msg.isAutoResponse ||
      msg.is_auto_response ||
      msg.senderType === 'auto_response' ||
      msg.sender_type === 'auto_response'
    );
    // messages has no `sender` column — the reliable signal is sender_id.
    // A message is FROM THE CUSTOMER only when sender_id matches this
    // conversation's customer_id; everything else (staff's own id, or null,
    // per how the admin app writes it) is an outgoing/staff message.
    const isSent = isAutoResponse || msg.senderId !== activeChat?.customerId;
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
              className={`message-bubble ${
                isAutoResponse
                  ? 'bubbles-auto-reply'
                  : isSent
                  ? 'bubbles-sent'
                  : 'bubbles-received'
              } bubble-hoverable`}
              onMouseEnter={(e) => {
                e.currentTarget.querySelectorAll('.reaction-trigger').forEach((btn) => {
                  btn.style.opacity = '1';
                });
              }}
              onMouseLeave={(e) => {
                e.currentTarget.querySelectorAll('.reaction-trigger').forEach((btn) => {
                  btn.style.opacity = '0';
                });
              }}
              onClick={() => {
                if (!isSent) return;
                const id = msg.id || msg.docId;
                setExpandedMsgId((prev) => (prev === id ? null : id));
              }}
              onKeyDown={(e) => {
                if (!isSent || (e.key !== 'Enter' && e.key !== ' ')) return;
                e.preventDefault();
                const id = msg.id || msg.docId;
                setExpandedMsgId((prev) => (prev === id ? null : id));
              }}
              role={isSent ? 'button' : undefined}
              tabIndex={isSent ? 0 : undefined}
              aria-label={isSent ? 'Toggle delivery status' : undefined}
              style={isSent ? { cursor: 'pointer' } : undefined}
            >
              {isAutoResponse && (
                <div className="auto-response-badge">
                  <Zap size={11} className="mr-1 inline" />
                  <span>Automated Acknowledgment</span>
                </div>
              )}
              {/* Product Context Card */}
              {msg.contextType === 'product' ? (
                (() => {
                  const product = msg.contextRef ? productPreviews[msg.contextRef] : null;
                  return (
                    <div
                      className="msg-product-card"
                      onClick={(e) => {
                        e.stopPropagation();
                        const searchParam = product?.name || msg.contextLabel;
                        if (searchParam) {
                          navigate(`/catalog?search=${encodeURIComponent(searchParam)}`);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.stopPropagation();
                        e.preventDefault();
                        const searchParam = product?.name || msg.contextLabel;
                        if (searchParam) {
                          navigate(`/catalog?search=${encodeURIComponent(searchParam)}`);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      title="Click to view product in catalog"
                    >
                      <div className="msg-product-header">
                        <ShoppingBag size={13} />
                        <span>Question about product</span>
                      </div>
                      {product ? (
                        <div className="msg-product-content">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="msg-product-img" />
                          ) : (
                            <div className="msg-product-img-placeholder"><ShoppingBag size={18} /></div>
                          )}
                          <div className="msg-product-details">
                            <div className="msg-product-name">{product.name}</div>
                            <div className="msg-product-price">
                              {product.onSale && product.salePrice ? (
                                <>
                                  <span className="msg-price-sale">₱{Number(product.salePrice).toLocaleString()}</span>
                                  <span className="msg-price-original">₱{Number(product.price).toLocaleString()}</span>
                                </>
                              ) : (
                                <span>₱{Number(product.price).toLocaleString()}</span>
                              )}
                            </div>
                            {msg.contextLabel && (
                              <div className="msg-product-tag">{msg.contextLabel}</div>
                            )}
                          </div>
                        </div>
                      ) : msg.contextLabel ? (
                        <div className="msg-product-label-only">
                          <span className="msg-product-name">{msg.contextLabel}</span>
                        </div>
                      ) : (
                        <div className="msg-product-loading">Loading product details...</div>
                      )}
                    </div>
                  );
                })()
              ) : msg.contextLabel ? (
                <div className="msg-context-chip">
                  <span>Re: {msg.contextLabel}</span>
                </div>
              ) : null}

              {/* Image */}
              {msg.imageUrl && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImageModalUrl(msg.imageUrl);
                  }}
                  style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block' }}
                  aria-label="View full-size image"
                >
                  <img
                    src={msg.imageUrl}
                    alt="Chat attachment"
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

              {isSent && (index === lastSentIndex || expandedMsgId === (msg.id || msg.docId)) && (
                <span className="msg-status">
                  {msg.readAt ? (
                    <>
                      Seen{expandedMsgId === (msg.id || msg.docId) ? ` ${formatSmartDateTime(msg.readAt)}` : ''}{' '}
                      <CheckCheck size={12} className="msg-status-icon msg-status-seen" />
                    </>
                  ) : msg.deliveredAt ? (
                    <>
                      Delivered{expandedMsgId === (msg.id || msg.docId) ? ` ${formatSmartDateTime(msg.deliveredAt)}` : ''}{' '}
                      <CheckCheck size={12} className="msg-status-icon" />
                    </>
                  ) : (
                    <>
                      Sent <Check size={12} className="msg-status-icon" />
                    </>
                  )}
                </span>
              )}

              <span className="msg-time">
                {msgTime}
                {msg.editedAt ? ' · edited' : ''}
              </span>

              {/* Edit trigger (own text messages only, visible on hover) */}
              {isSent && canEditMsg(msg) && (
                <button
                  className="reaction-trigger edit-trigger"
                  style={{ opacity: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    beginEdit(msg);
                  }}
                  title="Edit message"
                  aria-label="Edit message"
                >
                  <Pencil size={13} />
                </button>
              )}

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
                  role="presentation"
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
                <button
                  key={emoji}
                  type="button"
                  className="reaction-chip"
                  onClick={() => handleReaction(msg, emoji)}
                  title="Click to react"
                >
                  {emoji} {count > 1 ? count : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="messages-layout" data-mobile-view={mobileView}>
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
                  setMobileView('chat');
                  if (conv.unreadCount > 0) {
                    updateConversation(conv.docId, { unreadCount: 0 });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  setActiveChat(conv);
                  setMobileView('chat');
                  if (conv.unreadCount > 0) {
                    updateConversation(conv.docId, { unreadCount: 0 });
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="avatar-wrap">
                  <div
                    className="avatar"
                    style={{ backgroundColor: getAvatarColor(getConvName(conv)) }}
                  >
                    {getConvName(conv).split(' ').map((n) => n[0]).join('')}
                  </div>
                  {onlineUsers[conv.customerId] && <span className="presence-dot" />}
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
                <button
                  type="button"
                  className="chat-back-btn"
                  aria-label="Back to conversations"
                  onClick={() => setMobileView('list')}
                >
                  <ChevronLeft size={20} />
                </button>
                <div
                  className="avatar"
                  style={{ backgroundColor: getAvatarColor(getConvName(activeChat)) }}
                >
                  {getConvName(activeChat).split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <h3>{getConvName(activeChat)}</h3>
                  {otherTyping ? (
                    <p className="status-text typing">typing...</p>
                  ) : onlineUsers[activeChat.customerId] ? (
                    <p className="status-text online">● Online</p>
                  ) : (
                    <p className="status-text offline">Offline</p>
                  )}
                </div>
              </div>
              <div className="flex-center gap-2">
                <button
                  type="button"
                  className="chat-info-btn btn-outline small flex-center gap-2"
                  aria-label="View customer context"
                  onClick={() => setMobileView('context')}
                >
                  <Info size={14} />
                </button>
                <button
                  className="btn-outline small flex-center gap-2"
                  onClick={() =>
                    navigate(`/customers?search=${encodeURIComponent(getConvName(activeChat))}`)
                  }
                >
                  <User size={14} /> View Profile
                </button>
              </div>
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
              {otherTyping && (
                <div className="message-bubble-wrapper received">
                  <div
                    className="avatar small-av"
                    style={{ backgroundColor: getAvatarColor(getConvName(activeChat)) }}
                  >
                    {getInitials(getConvName(activeChat))[0]}
                  </div>
                  <div className="bubble-col">
                    <div className="message-bubble bubbles-received typing-bubble">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}
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
          {editingMsg && (
            <div className="editing-banner">
              <Pencil size={13} />
              <span>Editing message</span>
              <button type="button" className="icon-btn" onClick={cancelEdit} aria-label="Cancel editing">
                <X size={14} />
              </button>
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

            {!editingMsg && (
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
            )}

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
              placeholder={editingMsg ? 'Edit your message...' : 'Type your message...'}
              value={newMessage}
              onChange={(e) => handleMessageInputChange(e.target.value)}
            />

            <button
              type="submit"
              className="send-btn"
              aria-label={editingMsg ? 'Save changes' : 'Send message'}
              disabled={!newMessage.trim()}
            >
              {editingMsg ? <Pencil size={16} /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>

      {/* Customer Context Sidebar */}
      <div className="context-panel card">
        <div className="context-panel-header">
          <button
            type="button"
            className="context-back-btn"
            aria-label="Back to chat"
            onClick={() => setMobileView('chat')}
          >
            <ChevronLeft size={20} />
          </button>
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
              <button
                className="btn-outline small full-width flex-center gap-2 mt-2 text-gold"
                onClick={() => setShowNotifyModal(true)}
              >
                <Bell size={14} /> Send Push Notification
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

            {/* Inquired Products */}
            <div className="context-section">
              <h4 className="context-section-title">Inquired Products</h4>
              {(() => {
                const productMsgs = messages.filter(
                  (m) => m.contextType === 'product' && (m.contextRef || m.contextLabel)
                );
                const uniqueProductIds = [...new Set(productMsgs.map((m) => m.contextRef).filter(Boolean))];
                if (uniqueProductIds.length === 0 && productMsgs.length === 0) {
                  return (
                    <p className="text-secondary text-sm" style={{ margin: '0.25rem 0' }}>
                      No product inquiries in chat
                    </p>
                  );
                }
                return uniqueProductIds.map((pId) => {
                  const p = productPreviews[pId];
                  return (
                    <div
                      key={pId}
                      className="context-res-item"
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        if (p?.name) {
                          navigate(`/catalog?search=${encodeURIComponent(p.name)}`);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        if (p?.name) {
                          navigate(`/catalog?search=${encodeURIComponent(p.name)}`);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      title="Click to view product in catalog"
                    >
                      <div className="context-res-name" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShoppingBag size={14} style={{ color: 'var(--accent, #8b5cf6)' }} />
                        <span>{p?.name || 'Loading Product...'}</span>
                      </div>
                      {p && (
                        <div className="context-res-finance" style={{ marginTop: '0.25rem' }}>
                          Price: ₱{Number(p.onSale && p.salePrice ? p.salePrice : p.price).toLocaleString()}
                        </div>
                      )}
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
                Customer body measurements and fit recommendations are accessible via the main profile view.
              </p>
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
        <div
          className="modal-overlay"
          onClick={() => setShowNewConvModal(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            setShowNewConvModal(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
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
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        startNewConversation(c);
                      }}
                      role="button"
                      tabIndex={0}
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
        <div
          className="modal-overlay"
          onClick={() => setImageModalUrl(null)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            setImageModalUrl(null);
          }}
          role="button"
          tabIndex={0}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
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
      {showNotifyModal && activeChat && (
        <SendNotificationModal
          customer={{
            id: activeChat.customerId,
            name: getConvName(activeChat),
            email: activeChat.customerEmail,
          }}
          onClose={() => setShowNotifyModal(false)}
        />
      )}
    </div>
  );
};

export default Messages;
