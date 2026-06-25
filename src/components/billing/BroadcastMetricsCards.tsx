import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Clock, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

// Aggregate today's broadcast metrics from message_logs (status: queued/sent/delivered/read/failed)
export function BroadcastMetricsCards() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['broadcast-metrics-today', user?.id],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: rows, error } = await supabase
        .from('message_logs')
        .select('status')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);
      if (error) throw error;
      const r = rows || [];
      const recipients = r.length;
      const accepted = r.filter(x => ['sent', 'accepted', 'queued', 'delivered', 'read'].includes((x.status || '').toLowerCase())).length;
      const deliveredOrRead = r.filter(x => ['delivered', 'read'].includes((x.status || '').toLowerCase())).length;
      const failed = r.filter(x => ['failed', 'error'].includes((x.status || '').toLowerCase())).length;
      return { recipients, accepted, deliveredOrRead, failed };
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const items = [
    { label: 'Destinatários', value: data?.recipients ?? 0, icon: Users, color: 'text-emerald-400' },
    { label: 'Aceitas Meta', value: data?.accepted ?? 0, icon: Clock, color: 'text-emerald-400' },
    { label: 'Entregues/Lidas', value: data?.deliveredOrRead ?? 0, icon: Check, color: 'text-emerald-400' },
    { label: 'Falhas', value: data?.failed ?? 0, icon: AlertTriangle, color: 'text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{it.label}</span>
              <Icon className={`w-4 h-4 ${it.color}`} />
            </div>
            <div className="text-3xl font-bold">{it.value}</div>
          </div>
        );
      })}
    </div>
  );
}
