import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Clock, Check, AlertTriangle, FileCheck, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { extractCrmBroadcastSummary, type CrmBroadcastSummary } from '@/lib/crm-stats';

type Summary = Partial<CrmBroadcastSummary>;

// Aggregated broadcast metrics from the CRM Oficial endpoint
// GET /api/public/v1/broadcasts-stats, with fallback to local message_logs.
export function BroadcastMetricsCards({ broadcastId }: { broadcastId?: string } = {}) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['broadcast-metrics-today-local', user?.id, broadcastId],
    queryFn: async (): Promise<Summary> => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const start = `${today}T00:00:00`;
      const end = `${today}T23:59:59`;

      // Source of truth: billing_logs (o mesmo que alimenta o "Relatório de Hoje")
      const { data: bLogs } = await supabase
        .from('billing_logs')
        .select('whatsapp_status, customer_id, sent_at')
        .gte('sent_at', start)
        .lte('sent_at', end);
      const b = bLogs || [];
      const norm = (s: string) => (s || '').toLowerCase();
      const isSent = (s: string) => ['sent', 'accepted', 'queued', 'delivered', 'read'].includes(norm(s));
      const isFail = (s: string) => norm(s).startsWith('error') || ['failed', 'error'].includes(norm(s));
      const isPending = (s: string) => ['pending', 'queued', ''].includes(norm(s));

      // Entregues/lidas/falhas devem vir da Meta (via CRM Oficial).
      let delivered = 0;
      let read = 0;
      let metaFailed = 0;
      let metaSent = 0;
      let templatesApproved = 0;
      try {
        const { data: res, error } = await supabase.functions.invoke('crm-oficial-sync', {
          body: { action: 'broadcasts-stats', broadcast_id: broadcastId, date: today },
        });
        if (!error) {
          const s = extractCrmBroadcastSummary(res);
          delivered = s.delivered || 0;
          read = s.read || 0;
          metaFailed = s.failed || 0;
          metaSent = s.sent || 0;
          templatesApproved = s.templates_approved || 0;
        }
      } catch (_) { /* Meta indisponível: mantém 0 */ }

      const uniqueRecipients = new Set(b.map(x => x.customer_id).filter(Boolean)).size;
      const localSent = b.filter(x => isSent(x.whatsapp_status)).length;
      const localFail = b.filter(x => isFail(x.whatsapp_status)).length;

      return {
        broadcasts_count: b.length,
        recipients_total: uniqueRecipients || b.length,
        sent: Math.max(metaSent, localSent),
        delivered,
        read,
        failed: Math.max(metaFailed, localFail),
        pending: Math.max(0, b.length - Math.max(metaSent, localSent) - Math.max(metaFailed, localFail)),
        templates_approved: templatesApproved,
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
