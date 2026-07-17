import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Check, Phone, QrCode, ArrowLeft, Copy, Sparkles, ShieldCheck, Tv, User as UserIcon, AlertTriangle, Server, Smartphone, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import pixLogo from '@/assets/pix-logo.png.asset.json';
import cardLogo from '@/assets/card-logo.png.asset.json';

interface Plan {
  id: string; name: string; duration_days: number; price: number;
  cakto_url: string | null; card_url: string | null;
  screens: number; kind: 'pix' | 'card';
}
interface Customer {
  id: string; name: string; username: string; due_date: string; status: string;
  current_plan: string | null; screens: number;
}
interface CheckoutData {
  slug: string; display_name: string | null; logo_url: string | null; brand_color: string;
  headline: string | null; subheadline: string | null;
  methods: { efi: boolean; cakto: boolean };
  plans: any[];
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const fmtBRL = (n: number) => `R$ ${Number(n).toFixed(2).replace('.', ',')}`;
function durationLabel(days: number) {
  if (days <= 31) return 'MENSAL';
  if (days <= 62) return 'BIMESTRAL';
  if (days <= 92) return 'TRIMESTRAL';
  if (days <= 186) return 'SEMESTRAL';
  return 'ANUAL';
}
function extractScreens(name: string): number {
  const m = name?.match(/(\d+)\s*(telas?|screens?|dispositivos?)/i);
  if (m) return Math.min(parseInt(m[1], 10), 10);
  return 1;
}
function isCardPlan(name: string): boolean {
  return /cart(a|ã)o/i.test(name || '');
}

/** Group raw plans by (screens, duration_days). Prefer pix as primary, keep card variant. */
interface PlanGroup { key: string; screens: number; duration_days: number; pix?: Plan; card?: Plan; }
function groupPlans(raw: any[]): PlanGroup[] {
  const groups = new Map<string, PlanGroup>();
  for (const p of raw) {
    const screens = extractScreens(p.name);
    const kind: 'pix' | 'card' = isCardPlan(p.name) ? 'card' : 'pix';
    const norm: Plan = { ...p, screens, kind };
    const key = `${screens}::${p.duration_days}`;
    let g = groups.get(key);
    if (!g) { g = { key, screens, duration_days: p.duration_days }; groups.set(key, g); }
    if (kind === 'pix' && (!g.pix || p.price < g.pix.price)) g.pix = norm;
    if (kind === 'card' && (!g.card || p.price < g.card.price)) g.card = norm;
  }
  return Array.from(groups.values()).sort((a, b) => a.screens - b.screens || a.duration_days - b.duration_days);
}

export default function ResellerCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal steps: 'phone' -> 'accounts' -> 'method' -> 'pix'
  const [step, setStep] = useState<null | 'phone' | 'accounts' | 'method' | 'pix'>(null);
  const [group, setGroup] = useState<PlanGroup | null>(null);

  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [creating, setCreating] = useState(false);
  const [pix, setPix] = useState<{ txid: string; qr: string; copy: string; amount: number } | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_BASE}/reseller-checkout-data?slug=${encodeURIComponent(slug || '')}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Não encontrado');
        setData(j);
      } catch (e: any) {
        toast.error(e.message || 'Link inválido');
      } finally { setLoading(false); }
    })();
  }, [slug]);

  // Poll Pix
  useEffect(() => {
    if (!pix || paid) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${FN_BASE}/reseller-checkout-charge`, {
          method: 'POST',
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'poll', txid: pix.txid }),
        });
        const j = await res.json();
        if (j.status === 'paid') { setPaid(true); clearInterval(t); }
      } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [pix, paid]);

  const brand = data?.brand_color || '#e11d48';
  const brandStyle = useMemo(() => ({ '--brand': brand } as React.CSSProperties), [brand]);
  const grouped = useMemo(() => data ? groupPlans(data.plans) : [], [data]);

  const singles = grouped.filter(g => g.screens === 1);
  const multi = grouped.filter(g => g.screens >= 2);
  const multiByScreens = new Map<number, PlanGroup[]>();
  for (const g of multi) {
    const arr = multiByScreens.get(g.screens) || [];
    arr.push(g);
    multiByScreens.set(g.screens, arr);
  }

  const totalSelectedScreens = useMemo(
    () => selectedIds.reduce((sum, id) => sum + (customers.find(c => c.id === id)?.screens || 1), 0),
    [selectedIds, customers]
  );
  const requiredScreens = group?.screens || 1;

  const openPlan = (g: PlanGroup) => {
    setGroup(g); setSelectedIds([]); setCustomers([]); setStep('phone');
  };
  const resetAll = () => {
    setStep(null); setGroup(null); setPhone(''); setCustomers([]); setSelectedIds([]);
    setPix(null); setPaid(false);
  };

  const doSearch = async () => {
    if (!phone.trim()) { toast.error('Informe seu telefone'); return; }
    setSearching(true);
    try {
      const res = await fetch(`${FN_BASE}/reseller-checkout-lookup`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, phone }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Falha');
      const list: Customer[] = j.customers || [];
      if (!list.length) { toast.warning('Nenhum usuário encontrado. Verifique o telefone.'); return; }
      // Only include accounts with screens <= plan.screens
      const eligible = list.filter(c => (c.screens || 1) <= requiredScreens);
      if (!eligible.length) {
        toast.warning('Seus cadastros têm mais telas que este plano. Escolha um plano maior.');
        return;
      }
      setCustomers(eligible);
      // auto-select first if fits exactly
      const first = eligible[0];
      if (first && (first.screens || 1) === requiredScreens) setSelectedIds([first.id]);
      setStep('accounts');
    } catch (e: any) { toast.error(e.message); }
    finally { setSearching(false); }
  };

  const toggleAccount = (c: Customer) => {
    const cs = c.screens || 1;
    if (selectedIds.includes(c.id)) {
      setSelectedIds(prev => prev.filter(id => id !== c.id));
    } else {
      if (totalSelectedScreens + cs > requiredScreens) {
        toast.warning(`Este plano suporta ${requiredScreens} tela(s). Remova outra conta primeiro.`);
        return;
      }
      setSelectedIds(prev => [...prev, c.id]);
    }
  };

  const goPayment = () => {
    if (totalSelectedScreens !== requiredScreens) {
      toast.warning(`Selecione contas que somem exatamente ${requiredScreens} tela(s).`);
      return;
    }
    setStep('method');
  };

  const pay = async (method: 'pix' | 'cakto' | 'cakto_card') => {
    if (!group) return;
    let plan: Plan | undefined;
    if (method === 'pix') plan = group.pix || group.card;
    else if (method === 'cakto_card') plan = group.pix?.card_url ? group.pix : (group.card || group.pix);
    else plan = group.pix || group.card;
    if (!plan) { toast.error('Plano indisponível'); return; }
    setCreating(true);
    try {
      const res = await fetch(`${FN_BASE}/reseller-checkout-charge`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create', slug, plan_id: plan.id, method,
          customer_ids: selectedIds,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Falha ao gerar cobrança');
      if (j.method === 'cakto' || j.method === 'cakto_card') { window.location.href = j.checkout_url; return; }
      setPix({ txid: j.txid, qr: j.qrcode_base64 || '', copy: j.pix_copia_cola || '', amount: j.amount });
      setStep('pix');
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d]"><Loader2 className="w-8 h-8 text-white/60 animate-spin" /></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-[#0d0d0d] text-white">Link inválido ou desativado.</div>;

  const pixTotal = selectedIds.reduce((s, id) => {
    const c = customers.find(x => x.id === id);
    return s + Number((c as any)?.custom_price ?? group?.pix?.price ?? 0);
  }, 0);
  const cardTotal = selectedIds.reduce((s, id) => {
    const c = customers.find(x => x.id === id);
    return s + Number((c as any)?.custom_price ?? group?.card?.price ?? group?.pix?.price ?? 0);
  }, 0);

  const renderPlanCard = (g: PlanGroup, popular = false, saveBadge?: string) => {
    const primary = g.pix || g.card;
    if (!primary) return null;
    return (
      <button
        key={g.key}
        type="button"
        onClick={() => openPlan(g)}
        className={`group relative rounded-2xl bg-gradient-to-br from-[#161616] to-[#0f0f0f] border text-left p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0d0d0d] ${popular ? 'border-[var(--brand)] shadow-[0_0_30px_-8px_var(--brand)]' : 'border-white/[0.08] hover:border-white/25'}`}
        style={popular ? { boxShadow: `0 0 40px -12px ${brand}` } : undefined}
      >
        {/* glow overlay on hover */}
        <span
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `radial-gradient(600px circle at 50% 0%, ${brand}18, transparent 60%)` }}
        />
        {popular && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full text-white shadow-lg z-10 animate-pulse" style={{ background: brand }}>
            ✨ MAIS POPULAR
          </span>
        )}
        {saveBadge && (
          <span className="absolute -top-3 right-4 text-[10px] font-bold px-3 py-1 rounded-full bg-emerald-500 text-white shadow-lg z-10">
            {saveBadge}
          </span>
        )}
        <div className="relative flex items-center gap-2 text-white/70 text-xs font-bold tracking-widest uppercase mb-4">
          <Tv className="w-4 h-4" style={{ color: brand }} /> {durationLabel(g.duration_days)}
        </div>
        <div className="relative mb-5">
          <p className="text-4xl font-extrabold text-white leading-none">
            <span className="text-sm text-white/50 font-normal align-top mr-1">R$</span>
            {Number(primary.price).toFixed(2).replace('.', ',')}
          </p>
        </div>
        <ul className="relative space-y-2 text-sm text-white/80 mb-6 flex-1">
          <li className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: brand }} /> {g.screens} tela{g.screens > 1 ? 's' : ''} simultânea{g.screens > 1 ? 's' : ''}</li>
          <li className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: brand }} /> Canais, Filmes e Séries</li>
          <li className="flex items-center gap-2"><Check className="w-4 h-4" style={{ color: brand }} /> Qualidade HD / Full HD</li>
        </ul>
        <div
          className={`relative w-full h-12 font-bold tracking-wide rounded-xl flex items-center justify-center gap-2 transition-all ${popular ? 'text-white shadow-md' : 'bg-white/[0.04] group-hover:bg-white/[0.08] text-white'}`}
          style={popular ? { background: brand } : undefined}
        >
          ASSINAR / RENOVAR
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </div>
      </button>
    );
  };

  // save badge helper for 1-tela section
  const oneMonth = singles.find(s => s.duration_days <= 31)?.pix?.price;
  const saveBadge = (g: PlanGroup) => {
    if (!oneMonth || g.duration_days <= 31) return undefined;
    const months = g.duration_days / 30;
    const fullPrice = oneMonth * months;
    const p = g.pix?.price || 0;
    const pct = Math.round((1 - p / fullPrice) * 100);
    if (pct >= 5) return `Economize ${pct}%`;
    return undefined;
  };
  const popularId = singles.find(s => s.duration_days >= 60 && s.duration_days <= 100)?.key
    || singles[1]?.key;

  return (
    <div style={brandStyle} className="min-h-screen text-white bg-[#0a0a0a] relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full blur-3xl" style={{ background: `radial-gradient(closest-side, ${brand}22, transparent 70%)` }} />
      </div>

      {/* Header */}
      <header className="relative pt-8 pb-4 px-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex-1" />
        <div className="text-center">
          {data.logo_url ? (
            <img src={data.logo_url} alt={data.display_name || ''} className="h-14 md:h-16 mx-auto object-contain" />
          ) : (
            <h1 className="text-2xl md:text-3xl font-extrabold" style={{ color: brand }}>{data.display_name || 'Assinatura'}</h1>
          )}
        </div>
        <div className="flex-1 flex justify-end">
          <Link
            to={`/r/${slug}/ativar`}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wide rounded-full border border-white/15 bg-white/[0.03] hover:bg-white/[0.08] transition-all hover:border-[var(--brand)]"
          >
            <Smartphone className="w-4 h-4" style={{ color: brand }} /> ATIVAR APP
          </Link>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 pb-20 space-y-12">
        {/* Hero title */}
        <section className="text-center space-y-3 pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold tracking-widest border backdrop-blur-sm" style={{ borderColor: brand, color: brand, background: `${brand}0d` }}>
            <Sparkles className="w-3.5 h-3.5" /> {data.headline || 'MELHOR CUSTO-BENEFÍCIO'}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            Escolha seu <span style={{ color: brand }}>Plano</span>
          </h1>
          <p className="text-white/50 text-sm">{data.subheadline || 'Assista onde e quando quiser. Cancele a qualquer momento.'}</p>
          <Link
            to={`/r/${slug}/ativar`}
            className="sm:hidden inline-flex items-center gap-2 mt-2 px-4 py-2 text-xs font-bold tracking-wide rounded-full border border-white/15 bg-white/[0.03]"
          >
            <Smartphone className="w-4 h-4" style={{ color: brand }} /> ATIVAR APP
          </Link>
        </section>

        {/* 1 tela */}
        {singles.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${brand}22`, color: brand }}>
                <Tv className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold">Plano 1 Tela</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {singles.map(g => renderPlanCard(g, g.key === popularId, saveBadge(g)))}
            </div>
          </section>
        )}

        {/* Multi telas */}
        {multi.length > 0 && (
          <section className="space-y-6 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${brand}22`, color: brand }}>
                <Server className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold">Planos Multi Telas</h2>
            </div>
            {[...multiByScreens.entries()].sort(([a],[b])=>a-b).map(([screens, list]) => (
              <div key={screens} className="space-y-3">
                <p className="text-sm text-white/60 flex items-center gap-2 font-semibold">
                  <Tv className="w-4 h-4" /> {screens} Telas Simultâneas
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {list.map(g => renderPlanCard(g, false, saveBadge(g)))}
                </div>
              </div>
            ))}
          </section>
        )}

        <footer className="text-center text-xs text-white/30 pt-8">
          Pagamento processado com segurança. {data.methods.efi && 'Pix instantâneo via Efí.'}
        </footer>
      </main>

      {/* ------- Dialog: Phone ------- */}
      <Dialog open={step === 'phone'} onOpenChange={(o) => !o && resetAll()}>
        <DialogContent className="bg-[#151515] border-white/10 text-white max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${brand}22`, color: brand }}>
                <Phone className="w-5 h-5" />
              </div>
              <DialogTitle className="text-xl">Identificação</DialogTitle>
            </div>
          </DialogHeader>
          {group && (
            <p className="text-sm text-white/70">
              Plano selecionado: <span className="font-bold text-white">{durationLabel(group.duration_days)} — {group.screens} tela{group.screens>1?'s':''}</span>
            </p>
          )}
          <p className="text-sm text-white/60">Digite o número de telefone cadastrado na sua conta:</p>
          <div className="flex gap-2">
            <div className="px-3 flex items-center gap-1 rounded-md bg-[#0d0d0d] border border-white/10 text-sm">
              🇧🇷 <span className="text-white/70">+55</span>
            </div>
            <Input
              inputMode="tel"
              placeholder="Seu número"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              className="h-11 bg-[#0d0d0d] border-white/10 text-white flex-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" onClick={resetAll} className="h-11 bg-transparent border-white/15 text-white hover:bg-white/5">Cancelar</Button>
            <Button onClick={doSearch} disabled={searching} className="h-11 font-bold text-white" style={{ background: brand }}>
              {searching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Continuar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------- Dialog: Accounts ------- */}
      <Dialog open={step === 'accounts'} onOpenChange={(o) => !o && resetAll()}>
        <DialogContent className="bg-[#151515] border-white/10 text-white max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${brand}22`, color: brand }}>
                <UserIcon className="w-5 h-5" />
              </div>
              <DialogTitle className="text-xl">Selecione suas Contas</DialogTitle>
            </div>
            <DialogDescription className="text-white/60">
              Encontramos <b className="text-white">{customers.length}</b> conta(s). Plano suporta <b className="text-white">{requiredScreens}</b> tela(s).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-white/10 bg-[#0d0d0d] px-3 py-2 text-sm flex items-center gap-2">
            <Tv className="w-4 h-4" style={{ color: brand }} />
            <span className={totalSelectedScreens === requiredScreens ? 'text-emerald-400 font-bold' : 'text-white'}>
              {totalSelectedScreens} / {requiredScreens} tela(s) selecionada(s)
            </span>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {customers.map(c => {
              const active = selectedIds.includes(c.id);
              const overdue = c.due_date && new Date(c.due_date) < new Date();
              return (
                <button key={c.id} onClick={() => toggleAccount(c)}
                  className={`w-full text-left rounded-xl p-3 border transition-all flex items-start gap-3 ${active ? 'border-[var(--brand)] bg-[var(--brand)]/10' : 'border-white/10 bg-[#0d0d0d] hover:border-white/25'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${active ? 'bg-[var(--brand)]' : 'bg-white/10'}`}>
                    {active && <Check className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{c.name || c.username}</p>
                    <p className="text-xs text-white/60 flex items-center gap-1"><UserIcon className="w-3 h-3" /> {c.username}</p>
                    <p className="text-xs text-white/60">Venc: <b>{new Date(c.due_date).toLocaleDateString('pt-BR')}</b></p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {overdue && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">Vencido</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">{c.screens || 1} tela{(c.screens || 1) > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep('phone')} className="h-11 bg-transparent border-white/15 text-white hover:bg-white/5">Voltar</Button>
            <Button onClick={goPayment} disabled={totalSelectedScreens !== requiredScreens} className="h-11 font-bold text-white" style={{ background: brand }}>
              Continuar ({selectedIds.length})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------- Dialog: Method ------- */}
      <Dialog open={step === 'method'} onOpenChange={(o) => !o && resetAll()}>
        <DialogContent className="bg-[#151515] border-white/10 text-white max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <DialogTitle className="text-xl">Confirmar Plano</DialogTitle>
            </div>
          </DialogHeader>
          {group && (
            <>
              <p className="text-sm text-white/70">Plano <b className="text-white">{durationLabel(group.duration_days)}</b> — {group.screens} tela(s)</p>
              <p className="text-sm text-white/70">Renovando <b className="text-white">{selectedIds.length}</b> conta(s) ({totalSelectedScreens} tela(s))</p>
              <p className="text-sm text-white/80 font-semibold pt-1">Escolha a forma de pagamento:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data.methods.efi && group.pix && (
                  <button onClick={() => pay('pix')} disabled={creating}
                    className="group rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/[0.06] to-transparent hover:border-emerald-400/70 hover:from-emerald-500/[0.12] p-5 flex flex-col items-center gap-2 transition-all disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-[0_0_25px_-6px_rgba(16,185,129,0.6)]">
                    <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      {creating ? <Loader2 className="w-6 h-6 animate-spin text-emerald-500" /> : <img src={pixLogo.url} alt="Pix" className="w-9 h-9" />}
                    </div>
                    <p className="font-bold text-sm tracking-wide">PIX INSTANTÂNEO</p>
                    <p className="text-[10px] text-white/50 -mt-1">Aprovação imediata</p>
                    <p className="text-xl font-extrabold">{fmtBRL(pixTotal || group.pix.price)}</p>
                  </button>
                )}
                {data.methods.cakto && (group.pix?.card_url || group.card?.cakto_url) && (
                  <button onClick={() => pay('cakto_card')} disabled={creating}
                    className="group rounded-xl border border-white/10 bg-gradient-to-br from-sky-500/[0.06] to-transparent hover:border-sky-400/70 hover:from-sky-500/[0.12] p-5 flex flex-col items-center gap-2 transition-all disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-[0_0_25px_-6px_rgba(56,189,248,0.6)]">
                    <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <img src={cardLogo.url} alt="Cartão" className="w-9 h-9" />
                    </div>
                    <p className="font-bold text-sm tracking-wide">CARTÃO DE CRÉDITO</p>
                    <p className="text-[10px] text-white/50 -mt-1">Processado pela Cakto</p>
                    <p className="text-xl font-extrabold">{fmtBRL(cardTotal || group.pix?.price || group.card?.price || 0)}</p>
                  </button>
                )}
                {data.methods.cakto && !data.methods.efi && group.pix?.cakto_url && (
                  <button onClick={() => pay('cakto')} disabled={creating}
                    className="group rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/[0.06] to-transparent hover:border-emerald-400/70 hover:from-emerald-500/[0.12] p-5 flex flex-col items-center gap-2 transition-all disabled:opacity-50 hover:-translate-y-0.5">
                    <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-sm">
                      <img src={pixLogo.url} alt="Pix" className="w-9 h-9" />
                    </div>
                    <p className="font-bold text-sm tracking-wide">PIX (CAKTO)</p>
                    <p className="text-[10px] text-white/50 -mt-1">Link Cakto</p>
                    <p className="text-xl font-extrabold">{fmtBRL(pixTotal || group.pix.price)}</p>
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/90 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  <b>Atenção:</b> os dados informados no pagamento devem ser <b>sempre do responsável da conta</b> para que o sistema consiga renovar corretamente, <b>principalmente o número de telefone</b>.
                </p>
              </div>
              <Button variant="outline" onClick={() => setStep('accounts')} className="h-11 bg-transparent border-white/15 text-white hover:bg-white/5">Voltar</Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------- Dialog: Pix ------- */}
      <Dialog open={step === 'pix'} onOpenChange={(o) => !o && resetAll()}>
        <DialogContent className="bg-[#151515] border-white/10 text-white max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <button onClick={() => setStep('method')} className="text-sm text-white/60 hover:text-white flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Voltar</button>
              <div className="text-xs text-white/60 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Ambiente seguro</div>
            </div>
            <DialogTitle className="text-center text-lg">{paid ? 'Pagamento confirmado!' : `Pague ${pix ? fmtBRL(pix.amount) : ''} para renovar`}</DialogTitle>
          </DialogHeader>
          {paid ? (
            <div className="text-center space-y-3 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500 mx-auto flex items-center justify-center"><Check className="w-10 h-10 text-white" /></div>
              <p className="text-sm text-white/80">Sua renovação foi processada. Em instantes o acesso é liberado.</p>
              <Button onClick={resetAll} className="w-full h-11 font-bold text-white" style={{ background: brand }}>Nova renovação</Button>
            </div>
          ) : pix && (
            <div className="space-y-3">
              {pix.qr ? (
                <div className="bg-white p-4 rounded-xl w-fit mx-auto">
                  <img
                    src={pix.qr.startsWith('data:') ? pix.qr : `data:image/png;base64,${pix.qr}`}
                    alt="QR Code Pix" className="w-56 h-56"
                  />
                </div>
              ) : (
                <div className="bg-white/5 rounded-xl h-56 flex items-center justify-center text-white/40 text-sm">
                  QR Code indisponível — use o código Pix abaixo
                </div>
              )}
              <div className="bg-[#0d0d0d] rounded-lg p-3 border border-white/10">
                <p className="text-[11px] text-white/50 mb-2">Ou copie e cole o código Pix:</p>
                <div className="flex gap-2">
                  <Input readOnly value={pix.copy} className="text-[11px] bg-black/40 border-white/10 h-9" />
                  <Button size="sm" onClick={() => { navigator.clipboard.writeText(pix.copy); toast.success('Copiado!'); }} style={{ background: brand }} className="h-9">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <p className="text-center text-xs text-white/50 flex items-center justify-center gap-2 pt-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aguardando pagamento...
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
