/**
 * usePresence.js
 *
 * Tracks this user as online on the 'presence:online' Realtime channel and
 * returns everyone else's live online state. The mobile app tracks itself on
 * the exact same channel name and payload shape (user_id, role, online_at),
 * so a staff member's browser tab and a customer's phone see each other's
 * presence without any extra table or polling.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * @param {string|null|undefined} userId - the current user's auth id (user.uid)
 * @param {string|null|undefined} role
 * @returns {Record<string, string>} online user_id -> role
 */
export const usePresence = (userId, role) => {
  const [onlineUsers, setOnlineUsers] = useState({});

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
          await channel.track({
            user_id: userId,
            role: role || 'staff',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role]);

  return onlineUsers;
};
