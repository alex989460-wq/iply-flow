import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MailCheck, MailOpen, RefreshCw } from 'lucide-react';

interface Row {
  message_id: string;
  template_name: string | null;
  recipient_email: string | null;
  status: string | null;
  error_message: string | null;
  sent_at: string;
  opened: boolean;
  first_opened_at: string | null;
  open_count: number;
}

const RANGES = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

const TEMPLATE_LABELS: Record<string, string> = {
  'billing-reminder': 'Cobrança',
  'payment-confirmation': 'Confirmação',
};

function fmt(d?: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

export default function EmailTrackingCard() {
  const [days, setDays] = useState(30);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['email-tracking', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_email_tracking', { _days: days, _limit: 200 });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const rows = data || [];
  const total = rows.length;
  const opened = rows.filter((r) => r.opened).length;
  const failed = rows.filter((r) => r.status === 'dlq' || r.status === 'failed').length;
  const rate = total ? Math.round((opened / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MailOpen className="h-5 w-5 text-primary" />
            Leitura dos e-mails
          </CardTitle>
          <CardDescription>
            Acompanhe se os e-mails de vencimento e de confirmação de pagamento foram abertos.
          </CardDescription>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? 'default' : 'outline'}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Enviados', value: total },
            { label: 'Lidos', value: opened },
            { label: 'Taxa de leitura', value: `${rate}%` },
            { label: 'Falhas', value: failed },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum e-mail enviado neste período.
          </p>
        ) : (
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div
                key={r.message_id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.recipient_email || '-'}</p>
                  <p className="text-xs text-muted-foreground">
                    {TEMPLATE_LABELS[r.template_name || ''] || r.template_name} · {fmt(r.sent_at)}
                  </p>
                  {r.error_message ? (
                    <p className="truncate text-xs text-destructive">{r.error_message}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.opened ? (
                    <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                      <MailCheck className="h-3 w-3" /> Lido
                    </Badge>
                  ) : r.status === 'dlq' || r.status === 'failed' ? (
                    <Badge variant="destructive">Falhou</Badge>
                  ) : r.status === 'suppressed' ? (
                    <Badge variant="secondary">Bloqueado</Badge>
                  ) : (
                    <Badge variant="outline">Não lido</Badge>
                  )}
                  {r.opened ? (
                    <span className="text-[11px] text-muted-foreground">
                      {fmt(r.first_opened_at)}{r.open_count > 1 ? ` · ${r.open_count}x` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          A leitura é detectada por imagem invisível no e-mail. Provedores como Outlook podem
          bloquear imagens, então alguns e-mails lidos podem aparecer como "não lido".
        </p>
      </CardContent>
    </Card>
  );
}
