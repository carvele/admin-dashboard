/**
 * useRealtimeSync.js
 *
 * Global React hook to subscribe to Supabase events for notification alerts.
 */

import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
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

// Resets the module state so the next mount reopens both channels. Called on
// last-listener teardown and on a channel error/close so a dropped socket
// doesn't leave isSubscribed permanently latched true with no way back in.
function teardown() {
  if (reservationsChannel) {
    supabase.removeChannel(reservationsChannel);
    reservationsChannel = null;
  }
  if (messagesChannel) {
    supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }
  isSubscribed = false;
}

export const useRealtimeSync = (onUpdate) => {
  useEffect(() => {
    if (onUpdate) listeners.add(onUpdate);

    if (!isSubscribed) {
      isSubscribed = true;
      requestNotificationPermission().catch(console.warn);

      const onChannelStatus = (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          teardown();
        }
      };

      // Listen to new reservations or updates to pending reservations
      reservationsChannel = supabase
        .channel('global-reservations-alert')
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
        .channel('global-messages-alert')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          // Only alert if the message is from a customer. sender_role is set
          // server-side by a trigger (never client-supplied), so this can't
          // be spoofed by the sender.
          if (payload.new.sender_role !== 'staff') {
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
      if (onUpdate) listeners.delete(onUpdate);
      // Only tear down once the last mounted consumer leaves -- other
      // components may still be relying on the shared channels.
      if (listeners.size === 0) teardown();
    };
  }, [onUpdate]);
};
