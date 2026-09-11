/**
 * usePresence.js
 *
 * Tracks this user as online on the 'presence:online' Realtime channel and
 * returns everyone else's live online state. The mobile app tracks itself on
 * the exact same channel name and payload shape (user_id, role, online_at),
 * so a staff member's browser tab and a customer's phone see each other's
 * presence without any extra table or polling.
 *
 * Hardened with error reporting, subscription status handling, and
 * resilient channel recreation on visibility restoration and network online events.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { errorReporting } from '../services/observability';

/**
 * @param {string|null|undefined} userId - the current user's auth id (user.uid)
 * @param {string|null|undefined} role
 * @returns {Record<string, string>} online user_id -> role
 */
export const usePresence = (userId, role) => {
  const [onlineUsers, setOnlineUsers] = useState({});
  const [reconnectGen, setReconnectGen] = useState(0);

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
    if (!userId) {
      setOnlineUsers({});
      return;
    }

    const channel = supabase.channel('presence:online', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const next = {};
        for (const presences of Object.values(state)) {
          const p = presences[0];
          if (p) next[p.user_id] = p.role;
        }
        setOnlineUsers(next);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              user_id: userId,
              role: role || 'staff',
              online_at: new Date().toISOString(),
            });
          } catch (err) {
            errorReporting.capture(err instanceof Error ? err : new Error(String(err)), {
              domain: 'messaging',
              operation: 'trackPresence',
            });
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          errorReporting.capture(new Error(`Presence channel error: ${status}`), {
            domain: 'messaging',
            operation: 'subscribePresence',
            status,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role, reconnectGen]);

  return onlineUsers;
};
