import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const KEY = 'evolution_last_seen';

function getLastSeen() {
  return localStorage.getItem(KEY) || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
}

export function useEvolutionUnread() {
  const { user } = useAuth();
  const location = useLocation();
  const [count, setCount] = useState(0);

  // Reset when entering the chat page
  useEffect(() => {
    if (location.pathname === '/chat-evolution' || location.pathname === '/chat') {
      localStorage.setItem(KEY, new Date().toISOString());
      setCount(0);
    }
  }, [location.pathname]);

  // Initial count
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const lastSeen = getLastSeen();
    supabase
      .from('evolution_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('direction', 'in')
      .gt('created_at', lastSeen)
      .then(({ count: c }) => {
        if (!cancelled) setCount(c || 0);
      });
    return () => { cancelled = true; };
  }, [user]);

  // Realtime increment
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('evolution_unread_badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evolution_messages', filter: `user_id=eq.${user.id}` }, (payload) => {
        const m = payload.new as { direction?: string; created_at?: string };
        if (m.direction !== 'in') return;
        if (location.pathname === '/chat-evolution' || location.pathname === '/chat') return;
        setCount((c) => c + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, location.pathname]);

  return count;
}
