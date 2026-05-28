import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, X, Phone, Server, User as UserIcon, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PendingItem {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  username: string | null;
  server_name: string | null;
  server_host: string | null;
  plan_name: string | null;
  amount: number | null;
  new_due_date: string | null;
  reason: string;
  error_details: any;
  created_at: string;
}

const REASON_LABEL: Record<string, string> = {
  no_api: 'Servidor sem API',
  renewal_failed: 'Falha na renovação',
  manual: 'Manual',
};

const REASON_COLOR: Record<string, string> = {
  no_api: 'bg-amber-500',
  renewal_failed: 'bg-red-500',
  manual: 'bg-blue-500',
};

export default function PendingManualRenewalsFloat() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('pending_manual_renewals')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setItems(data as any);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    load();

    const channel = supabase
      .channel('pending-manual-renewals-' + user.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pending_manual_renewals', filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const item = payload.new as PendingItem;
          setItems((prev) => [item, ...prev]);
          setExpanded(true);
          setHidden(false);
          toast.warning(`Renovação manual pendente: ${item.customer_name}`, {
            description: `${item.server_name || ''} • ${item.username || ''}`,
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pending_manual_renewals', filter: `owner_id=eq.${user.id}` },
        (payload) => {
          const old = payload.old as { id: string };
          setItems((prev) => prev.filter((p) => p.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const resolve = async (id: string) => {
    setResolving(id);
    const { error } = await supabase.from('pending_manual_renewals').delete().eq('id', id);
    setResolving(null);
    if (error) {
      toast.error('Erro ao dar baixa: ' + error.message);
    } else {
      toast.success('Pendência resolvida');
      setItems((prev) => prev.filter((p) => p.id !== id));
    }
  };

  if (!user || items.length === 0 || hidden) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-[min(420px,calc(100vw-2rem))] max-h-[80vh] flex flex-col rounded-xl border bg-card shadow-2xl animate-in slide-in-from-bottom-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between gap-2 p-3 border-b hover:bg-muted/50 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          </div>
          <span className="font-semibold text-sm">Pendências de Renovação</span>
          <Badge variant="destructive" className="ml-1">{items.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setHidden(true); }}
            className="p-1 rounded hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="overflow-y-auto flex-1 divide-y">
          {items.map((it) => (
            <div key={it.id} className="p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{it.customer_name}</span>
                    <Badge className={cn('text-white text-[10px] px-1.5 py-0', REASON_COLOR[it.reason] || 'bg-gray-500')}>
                      {REASON_LABEL[it.reason] || it.reason}
                    </Badge>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => resolve(it.id)}
                  disabled={resolving === it.id}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Dar baixa
                </Button>
              </div>

              <div className="grid gap-1 text-xs text-muted-foreground">
                {it.customer_phone && (
                  <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{it.customer_phone}</div>
                )}
                {it.username && (
                  <div className="flex items-center gap-1.5"><UserIcon className="h-3 w-3" /><span className="font-mono">{it.username}</span></div>
                )}
                {it.server_name && (
                  <div className="flex items-center gap-1.5"><Server className="h-3 w-3" />{it.server_name}</div>
                )}
                {it.new_due_date && (
                  <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />Novo venc.: {new Date(it.new_due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                )}
                {it.plan_name && <div className="text-[11px]">📦 {it.plan_name}{it.amount ? ` • R$ ${Number(it.amount).toFixed(2)}` : ''}</div>}
                {it.error_details?.conflict_reason && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400">🧩 {it.error_details.conflict_reason}</div>
                )}
                {it.error_details?.confirm_url && (
                  <a
                    href={it.error_details.confirm_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary underline break-all"
                  >
                    Confirmar este cliente →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

          ))}
        </div>
      )}
    </div>
  );
}
