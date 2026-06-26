import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, CheckCheck, Eye, XCircle, Loader2, MessageCircleMore, Megaphone, FileCheck2, Clock } from 'lucide-react';
import { MetaLogo } from '@/components/ui/meta-logo';

export default function AttendancesStatsCard() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['crm-broadcasts-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'broadcasts-stats' },
      });
      if (error) throw error;
      const s = data?.broadcasts_stats ?? data ?? {};
      // normalize keys (CRM may return snake_case or camelCase)
      return {
        broadcasts: s.broadcasts ?? s.total_broadcasts ?? 0,
        recipients: s.recipients ?? s.total_recipients ?? 0,
        sent: s.sent ?? s.total_sent ?? 0,
        delivered: s.delivered ?? s.total_delivered ?? 0,
        read: s.read ?? s.total_read ?? 0,
        failed: s.failed ?? s.total_failed ?? 0,
        pending: s.pending ?? s.total_pending ?? 0,
        templates_approved: s.templates_approved ?? s.approved_templates ?? 0,
      };
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MetaLogo className="w-6 h-5" />
          <span>Atendimentos · API Oficial</span>
        </CardTitle>
        <CardDescription>
          Métricas reais da Meta WhatsApp Cloud API (entregues, lidas, falhas) via CRM Oficial.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="text-sm text-red-400 py-6 text-center">
            Não foi possível carregar as métricas do CRM Oficial. Verifique sua chave em Configurações.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Disparos" value={data?.broadcasts ?? 0} icon={Megaphone} accent="text-primary" />
            <StatCard label="Destinatários" value={data?.recipients ?? 0} icon={MessageCircleMore} accent="text-blue-400" />
            <StatCard label="Enviadas" value={data?.sent ?? 0} icon={Send} accent="text-cyan-400" />
            <StatCard label="Entregues" value={data?.delivered ?? 0} icon={CheckCheck} accent="text-emerald-400" />
            <StatCard label="Lidas" value={data?.read ?? 0} icon={Eye} accent="text-violet-400" />
            <StatCard label="Falhas" value={data?.failed ?? 0} icon={XCircle} accent="text-red-400" />
            <StatCard label="Pendentes" value={data?.pending ?? 0} icon={Clock} accent="text-amber-400" />
            <StatCard label="Templates aprovados" value={data?.templates_approved ?? 0} icon={FileCheck2} accent="text-fuchsia-400" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <div className="text-3xl font-bold">{Number(value).toLocaleString('pt-BR')}</div>
    </div>
  );
}
