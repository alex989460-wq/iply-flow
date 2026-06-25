import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Clock, Check, AlertTriangle, FileCheck, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

type Summary = {
  broadcasts_count?: number;
  recipients_total?: number;
  sent?: number;
  delivered?: number;
  read?: number;
  failed?: number;
  pending?: number;
  templates_approved?: number;
};

// Aggregated broadcast metrics from the CRM Oficial endpoint
// GET /api/public/v1/broadcasts-stats, with fallback to local message_logs.
export function BroadcastMetricsCards({ broadcastId }: { broadcastId?: string } = {}) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['broadcast-metrics-today', user?.id, broadcastId],
    queryFn: async (): Promise<Summary> => {
      // 1) Try CRM Oficial aggregated endpoint
      try {
        const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', {
          body: { action: 'broadcasts-stats', broadcast_id: broadcastId },
        });
        if (!error) {
          const summary =
            (res?.broadcasts_stats?.summary ?? res?.summary ?? res?.broadcasts_stats) as Summary | undefined;
          if (summary && typeof summary === 'object') return summary;
        }
      } catch (_) { /* fallback below */ }

      // 2) Local fallback: aggregate today's message_logs
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: rows } = await supabase
        .from('message_logs')
        .select('status')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`);
      const r = rows || [];
      const norm = (s: string) => (s || '').toLowerCase();
      return {
        recipients_total: r.length,
        sent: r.filter(x => ['sent', 'accepted', 'queued', 'delivered', 'read'].includes(norm(x.status))).length,
        delivered: r.filter(x => ['delivered', 'read'].includes(norm(x.status))).length,
        read: r.filter(x => norm(x.status) === 'read').length,
        failed: r.filter(x => ['failed', 'error'].includes(norm(x.status))).length,
        pending: r.filter(x => ['pending', 'queued'].includes(norm(x.status))).length,
      };
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
    { label: 'Disparos', value: data?.broadcasts_count ?? 0, icon: Send, color: 'text-sky-400' },
    { label: 'Destinatários', value: data?.recipients_total ?? 0, icon: Users, color: 'text-emerald-400' },
    { label: 'Enviadas', value: data?.sent ?? 0, icon: Clock, color: 'text-emerald-400' },
    { label: 'Entregues', value: data?.delivered ?? 0, icon: Check, color: 'text-emerald-400' },
    { label: 'Lidas', value: data?.read ?? 0, icon: Check, color: 'text-emerald-500' },
    { label: 'Falhas', value: data?.failed ?? 0, icon: AlertTriangle, color: 'text-amber-400' },
    { label: 'Pendentes', value: data?.pending ?? 0, icon: Clock, color: 'text-zinc-400' },
    { label: 'Templates OK', value: data?.templates_approved ?? 0, icon: FileCheck, color: 'text-emerald-400' },
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
