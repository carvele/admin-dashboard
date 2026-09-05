/**
 * useRealtimeSync.js
 *
 * Global React hook to subscribe to Supabase events for notification alerts.
 */

import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { 
  playReservationAlert, 
  playMessageAlert,
  showDesktopNotification,
  requestNotificationPermission
} from '../utils/notificationSound';

// Shared module-level singleton: multiple mounted consumers (currently just
// Dashboard.tsx, but the guard is meant to support more than one) all ride
// the same two channels rather than opening a duplicate pair each.
let isSubscribed = false;
let reservationsChannel = null;
let messagesChannel = null;
const listeners = new Set();
let teardownTimeoutId = null;
// Re-entrancy guard: removeChannel() fires _onClose which triggers the status
// callback again with "CLOSED". Without this flag that causes infinite recursion
// → Maximum call stack size exceeded.
let isTearingDown = false;

// Resets the module state so the next mount reopens both channels. Called on
// last-listener teardown and on a channel error so a dropped socket doesn't
// leave isSubscribed permanently latched true with no way back in.
function teardown() {
  if (isTearingDown) return;
  isTearingDown = true;
  try {
    if (reservationsChannel) {
      supabase.removeChannel(reservationsChannel);
      reservationsChannel = null;
    }
    if (messagesChannel) {
      supabase.removeChannel(messagesChannel);
      messagesChannel = null;
    }
    isSubscribed = false;
  } finally {
    isTearingDown = false;
  }
}

export const useRealtimeSync = (onUpdate) => {
  const { user } = useAuth();
  
  useEffect(() => {
    // Unique token per hook instance so listeners.size always accurately
    // counts mounted consumers regardless of whether onUpdate is provided.
    const token = onUpdate || (() => {});
    
    if (teardownTimeoutId) {
      clearTimeout(teardownTimeoutId);
      teardownTimeoutId = null;
    }

    listeners.add(token);

    if (!isSubscribed) {
      isSubscribed = true;
      requestNotificationPermission().catch(console.warn);

      const onChannelStatus = (status) => {
        // CLOSED fires during normal intentional removeChannel() — do NOT
        // teardown there or we recurse back into removeChannel infinitely.
        // Only reset on genuine transport errors.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          teardown();
        }
      };

      const resTopic = `global-reservations-alert-${Date.now()}`;
      const msgTopic = `global-messages-alert-${Date.now()}`;

      // Listen to new reservations or updates to pending reservations
      reservationsChannel = supabase
        .channel(resTopic)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations' }, (_payload) => {
          playReservationAlert();
          showDesktopNotification('New Reservation', {
            body: `A new reservation was just placed by a customer.`
          });
          listeners.forEach(cb => cb());
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations' }, (_payload) => {
          listeners.forEach(cb => cb());
        })
        .subscribe(onChannelStatus);

      // Listen to incoming customer messages
      messagesChannel = supabase
        .channel(msgTopic)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          if (payload.new && payload.new.sender_id !== user?.uid) {
            playMessageAlert();
            showDesktopNotification('New Message', {
              body: `You received a new message from a customer.`
            });
            listeners.forEach(cb => cb());
          }
        })
        .subscribe(onChannelStatus);
    }

    return () => {
      listeners.delete(token);
      if (listeners.size === 0) {
        teardownTimeoutId = setTimeout(() => {
          teardownTimeoutId = null;
          if (listeners.size === 0) teardown();
        }, 100);
      }
    };
  }, [onUpdate, user?.uid]);
};
