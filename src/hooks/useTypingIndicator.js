/**
 * useTypingIndicator.js
 *
 * Ephemeral typing broadcast hook on per-conversation channel (`typing:${conversationId}`).
 * Matches the mobile app's protocol (event 'typing', payload { sender_id }), 2000ms throttle,
 * and 4000ms remote reset timer.
 *
 * Hardened with error reporting, subscription status handling, and
 * resilient channel recreation on visibility restoration and network online events.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { errorReporting } from '../services/observability';

/**
 * @param {Object} options
 * @param {string|null|undefined} options.conversationId
 * @param {string|null|undefined} options.userId
 * @param {number} [options.throttleMs=2000]
 * @param {number} [options.timeoutMs=4000]
 * @returns {{ isOtherTyping: boolean, sendTyping: () => void }}
 */
export const useTypingIndicator = ({
  conversationId,
  userId,
  throttleMs = 2000,
  timeoutMs = 4000,
}) => {
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [reconnectGen, setReconnectGen] = useState(0);

  const channelRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastSentRef = useRef(0);

  // Tab visibility and online network listeners to trigger full channel recreation
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setReconnectGen((prev) => prev + 1);
      }
    };

    const handleOnline = () => {
      setReconnectGen((prev) => prev + 1);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    setIsOtherTyping(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!conversationId) {
      channelRef.current = null;
      return;
    }

    const channel = supabase.channel(`typing:${conversationId}`);

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.sender_id === userId) return;
        setIsOtherTyping(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setIsOtherTyping(false);
        }, timeoutMs);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          errorReporting.capture(new Error(`Typing channel error: ${status}`), {
            domain: 'messaging',
            operation: 'subscribeTyping',
            conversationId,
            status,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsOtherTyping(false);
    };
  }, [conversationId, userId, timeoutMs, reconnectGen]);

  const sendTyping = useCallback(() => {
    if (!userId || !channelRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < throttleMs) return;
    lastSentRef.current = now;

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender_id: userId },
    });
  }, [userId, throttleMs]);

  return {
    isOtherTyping,
    sendTyping,
  };
};
