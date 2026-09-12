import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, X, Phone, Server, User as UserIcon, Calendar, Search, Smartphone, Info, RefreshCw, Loader2, GripHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { describePanelError } from '@/lib/panel-error';
import { resolvePanel } from '@/lib/panel-detect';

interface PendingItem {
  id: string;
  customer_id?: string | null;
  server_id?: string | null;
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
  webhook_error: 'Erro no Webhook',
  manual: 'Manual',
  expired_over_90d: 'Vencido +90 dias',
  status_blocked: 'Status bloqueado',
  phone_not_found: 'Telefone não encontrado',
  app_activation: 'Ativação de App',
  clouddy_session_expired: 'Sessão Clouddy expirada',
  p2cine_session_expired: 'Sessão P2Cine expirada',
  ibosol_session_expired: 'Falha na conexão IBO Sol',
  screens_upgrade_required: 'Ajustar telas/conexões',
};

const REASON_COLOR: Record<string, string> = {
  no_api: 'bg-amber-500',
  renewal_failed: 'bg-red-500',
  webhook_error: 'bg-red-600',
  manual: 'bg-blue-500',
  expired_over_90d: 'bg-orange-500',
  status_blocked: 'bg-purple-500',
  phone_not_found: 'bg-pink-500',
  app_activation: 'bg-emerald-600',
  clouddy_session_expired: 'bg-amber-600',
  p2cine_session_expired: 'bg-amber-700',
  ibosol_session_expired: 'bg-amber-700',
  screens_upgrade_required: 'bg-cyan-600',
};

export default function PendingManualRenewalsFloat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Posição livre na tela (arrastável) — persistida por usuário
  const POS_KEY = 'pending_float_pos';
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
      }
    } catch { /* ignore */ }
    return null;
  });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: rect.left,
      baseY: rect.top,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    const el = panelRef.current;
    const w = el?.offsetWidth || 440;
    const h = el?.offsetHeight || 300;
    const x = Math.min(Math.max(d.baseX + dx, 8), Math.max(window.innerWidth - w - 8, 8));
    const y = Math.min(Math.max(d.baseY + dy, 8), Math.max(window.innerHeight - h - 8, 8));
    setPos({ x, y });
  }, []);

  const suppressClickRef = useRef(false);
  const onDragEnd = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) {
      suppressClickRef.current = true;
      setPos((p) => {
        if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ } }
        return p;
      });
    }
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('pending_manual_renewals')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    if (error || !data) return;

    // Resolve o nome do servidor quando a pendência foi criada sem ele
    const rows = data as any[];
    const missing = Array.from(
      new Set(rows.filter((r) => !r.server_name && r.server_id).map((r) => r.server_id))
    );
    if (missing.length) {
      const { data: servers } = await supabase
        .from('servers')
        .select('id, server_name, host')
        .in('id', missing as string[]);
      const map = new Map((servers || []).map((s: any) => [s.id, s]));
      rows.forEach((r) => {
        const s = r.server_id ? map.get(r.server_id) : null;
        if (s) {
          r.server_name = r.server_name || s.server_name;
          r.server_host = r.server_host || s.host;
        }
      });
    }
    setItems(rows as any);
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

  const monthsFromPlan = (plan?: string | null) => {
    const p = String(plan || '').toLowerCase();
    if (p.includes('trimes')) return 3;
    if (p.includes('semes')) return 6;
    if (p.includes('anual') || p.includes('ano')) return 12;
    return 1;
  };

  // Reenvia a solicitação que falhou (ativação de app ou renovação no painel)
  const retry = async (it: PendingItem) => {
    setRetrying(it.id);
    try {
      const requestId = it.error_details?.request_id;

      if (requestId) {
        const { data, error } = await supabase.functions.invoke('confirm-activation', {
          body: { request_id: requestId, action: 'activate', source: 'pending-retry' },
        });
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success('Ativação reenviada com sucesso!');
        setItems((prev) => prev.filter((p) => p.id !== it.id));
        await load();
        return;
      }

      const username = String(it.username || '').split(',')[0].trim();
      if (!username) {
        toast.error('Esta pendência não tem usuário para reenviar.');
        return;
      }

      let server: any = { server_name: it.server_name, host: it.server_host };
      if (it.server_id) {
        const { data: srv } = await supabase
          .from('servers')
          .select('server_name, host, panel_type')
          .eq('id', it.server_id)
          .maybeSingle();
        if (srv) server = srv;
      }

      const panel = resolvePanel(server);
      const months = monthsFromPlan(it.plan_name);
      const label = server.server_name || 'Painel';

      const call = async (fn: string, body: Record<string, unknown>) => {
        const { data, error } = await supabase.functions.invoke(fn, { body });
        if (error) throw new Error(describePanelError(label, error.message));
        if (!(data as any)?.success) throw new Error(describePanelError(label, (data as any)?.error || 'Falha no painel'));
      };

      const customerId = it.customer_id || undefined;
      if (panel === 'natv' || panel === 'natv2') {
        await call('natv-renew', { username, months, duration_days: months * 30, customer_id: customerId, ...(panel === 'natv2' ? { panel: 'natv2' } : {}) });
      } else if (panel === 'thebest') {
        await call('the-best-renew', { username, months, customer_id: customerId });
      } else if (panel === 'rush') {
        await call('rush-renew', { username, months, customer_id: customerId });
      } else if (panel === 'p2cine') {
        await call('p2cine-renew', { action: 'renew', username, months, customer_id: customerId });
      } else if (panel === 'uniplay') {
        await call('uniplay-renew', { username, months, customer_id: customerId });
      } else if (panel === 'vplay') {
        await call('vplay-renew', { username, new_due_date: it.new_due_date, customer_id: customerId });
      } else {
        await call('xui-renew', { username, new_due_date: it.new_due_date, customer_id: customerId });
      }

      toast.success('Renovação reenviada com sucesso!');
      await supabase.from('pending_manual_renewals').delete().eq('id', it.id);
      setItems((prev) => prev.filter((p) => p.id !== it.id));
    } catch (e) {
      toast.error('Não foi possível reenviar: ' + (e instanceof Error ? e.message : 'erro desconhecido'));
    } finally {
      setRetrying(null);
    }
  };

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
    <div
      ref={panelRef}
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
      className={cn(
        "fixed z-[100] w-[min(440px,calc(100vw-2rem))] max-h-[80vh] flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl ring-1 ring-black/5",
        !pos && "bottom-4 right-4 animate-in slide-in-from-bottom-4"
      )}
    >
      {/* Alça para arrastar para qualquer lugar da tela */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing touch-none border-b border-border/40 bg-muted/40 select-none"
        title="Arraste para mover"
      >
        <GripHorizontal className="h-4 w-4 text-muted-foreground" />
      </div>
      <button
        onClick={() => {
          if (suppressClickRef.current) { suppressClickRef.current = false; return; }
          setExpanded((v) => !v);
        }}
        className="relative flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent hover:from-amber-500/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <AlertTriangle className="h-4.5 w-4.5" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm leading-tight">Pendências de Renovação</p>
            <p className="text-[11px] text-muted-foreground">Ações que precisam de você</p>


          </div>
          <Badge variant="destructive" className="ml-1 rounded-full px-2">{items.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setHidden(true); }}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="overflow-y-auto flex-1 p-2.5 space-y-2.5">
          {items.map((it) => {
            const realError = describePanelError(
              it.server_name || 'Painel',
              it.error_details?.error || it.error_details?.message || it.error_details?.detail || '',
            );
            const hasError = Boolean(it.error_details?.error || it.error_details?.message || it.error_details?.detail);
            return (
              <div
                key={it.id}
                className="group rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{it.customer_name}</span>
                      {it.server_name && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full border-primary/30 text-primary">
                          {it.server_name}
                        </Badge>
                      )}
                      <Badge className={cn('text-white text-[10px] px-1.5 py-0 rounded-full border-0', REASON_COLOR[it.reason] || 'bg-gray-500')}>
                        {REASON_LABEL[it.reason] || it.reason}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(it.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                {hasError && (
                  <div className="mt-2 flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2">
                    <Info className="h-3.5 w-3.5 shrink-0 text-red-500 mt-0.5" />
                    <p className="text-[11px] leading-snug text-red-600 dark:text-red-300 break-words">{realError}</p>
                  </div>
                )}

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {it.customer_phone && (
                    <div className="flex items-center gap-1.5 truncate"><Phone className="h-3 w-3 shrink-0" />{it.customer_phone}</div>
                  )}
                  {it.username && (
                    <div className="flex items-center gap-1.5 truncate"><UserIcon className="h-3 w-3 shrink-0" /><span className="font-mono truncate">{it.username}</span></div>
                  )}
                  {it.server_name && (
                    <div className="flex items-center gap-1.5 truncate"><Server className="h-3 w-3 shrink-0" />{it.server_name}</div>
                  )}
                  {it.new_due_date && (
                    <div className="flex items-center gap-1.5 truncate"><Calendar className="h-3 w-3 shrink-0" />{new Date(it.new_due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                  )}
                  {it.plan_name && (
                    <div className="col-span-2 truncate">📦 {it.plan_name}{it.amount ? ` • R$ ${Number(it.amount).toFixed(2)}` : ''}</div>
                  )}
                  {it.error_details?.app_name && (
                    <div className="flex items-center gap-1.5 truncate"><Smartphone className="h-3 w-3 shrink-0" />{it.error_details.app_name}</div>
                  )}
                  {it.error_details?.mac_address && (
                    <div className="truncate">🖥 <span className="font-mono">{it.error_details.mac_address}</span></div>
                  )}
                  {it.error_details?.email && <div className="col-span-2 truncate">📧 {it.error_details.email}</div>}
                  {it.error_details?.conflict_reason && (
                    <div className="col-span-2 text-amber-600 dark:text-amber-400">🧩 {it.error_details.conflict_reason}</div>
                  )}
                  {it.error_details?.confirm_url && (
                    <a
                      href={it.error_details.confirm_url}
                      target="_blank"
                      rel="noreferrer"
                      className="col-span-2 text-primary underline break-all"
                    >
                      Confirmar este cliente →
                    </a>
                  )}
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => retry(it)}
                    disabled={retrying === it.id}
                    className="h-7 text-xs gap-1.5"
                    title="Tentar novamente a ativação/renovação no painel"
                  >
                    {retrying === it.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Reenviar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const term = (it.customer_phone || it.username || it.customer_name || '').toString().replace(/\D/g, '') || (it.username || it.customer_name || '');
                      navigate(`/customers?search=${encodeURIComponent(term)}`);
                    }}
                    className="h-7 flex-1 text-xs gap-1.5"
                    title="Buscar cliente na página de clientes"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Verificar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => resolve(it.id)}
                    disabled={resolving === it.id}
                    className="h-7 flex-1 text-xs gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Dar baixa
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


