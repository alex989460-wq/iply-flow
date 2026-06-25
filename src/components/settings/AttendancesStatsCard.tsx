import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircleMore, Send, CheckCheck, XCircle, Loader2 } from 'lucide-react';
import { MetaLogo } from '@/components/ui/meta-logo';

export default function AttendancesStatsCard() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['crm-attendances-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
      const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

      const [{ count: totalAll }, { count: totalMonth }, { count: totalToday }, { count: failed }] = await Promise.all([
        supabase.from('message_logs').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('source', 'crm_oficial'),
        supabase.from('message_logs').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('source', 'crm_oficial').gte('created_at', monthStart),
        supabase.from('message_logs').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('source', 'crm_oficial').gte('created_at', dayStart),
        supabase.from('message_logs').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('source', 'crm_oficial').eq('status', 'failed'),
      ]);
      return {
        totalAll: totalAll || 0,
        totalMonth: totalMonth || 0,
        totalToday: totalToday || 0,
        failed: failed || 0,
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
          Mensagens enviadas pelo canal oficial Meta da sua chave CRM.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total" value={data?.totalAll ?? 0} icon={MessageCircleMore} accent="text-primary" />
            <StatCard label="Este mês" value={data?.totalMonth ?? 0} icon={Send} accent="text-blue-400" />
            <StatCard label="Hoje" value={data?.totalToday ?? 0} icon={CheckCheck} accent="text-emerald-400" />
            <StatCard label="Falhas" value={data?.failed ?? 0} icon={XCircle} accent="text-red-400" />
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
      <div className="text-3xl font-bold">{value.toLocaleString('pt-BR')}</div>
    </div>
  );
}
