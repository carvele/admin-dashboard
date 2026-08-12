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

let isSubscribed = false;
const listeners = new Set();

export const useRealtimeSync = (onUpdate) => {
  useEffect(() => {
    if (onUpdate) listeners.add(onUpdate);

    if (!isSubscribed) {
      isSubscribed = true;
      requestNotificationPermission().catch(console.warn);

      // Listen to new reservations or updates to pending reservations
      const reservationsChannel = supabase
        .channel('global-reservations-alert')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations' }, (payload) => {
          playReservationAlert();
          showDesktopNotification('New Reservation', {
            body: `A new reservation was just placed by a customer.`
          });
          listeners.forEach(cb => cb());
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations' }, (payload) => {
          listeners.forEach(cb => cb());
        })
        .subscribe();

      // Listen to incoming customer messages
      const messagesChannel = supabase
        .channel('global-messages-alert')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          // Only alert if the message is from a customer
          if (payload.new.sender_type !== 'staff') {
            playMessageAlert();
            showDesktopNotification('New Message', {
              body: `You received a new message from a customer.`
            });
            listeners.forEach(cb => cb());
          }
        })
        .subscribe();
    }

    return () => {
      if (onUpdate) listeners.delete(onUpdate);
    };
  }, [onUpdate]);
};
