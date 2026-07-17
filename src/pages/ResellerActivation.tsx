import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Check, ChevronRight, Smartphone, QrCode, ShieldCheck, Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import pixLogo from '@/assets/pix-logo.png.asset.json';
import cardLogo from '@/assets/card-logo.png.asset.json';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const fmtBRL = (n: number) => `R$ ${Number(n).toFixed(2).replace('.', ',')}`;

interface AppItem {
  id: string; name: string; description?: string | null;
  logo_url?: string | null; icon?: string | null;
  requires_mac: boolean; requires_email: boolean;
  price_monthly: number | null;
  price_quarterly: number | null;
  price_annual: number | null;
}
type Duration = 'monthly' | 'quarterly' | 'annual';
interface Data {
  slug: string; display_name: string | null; logo_url: string | null;
  brand_color: string; methods: { efi: boolean; cakto: boolean };
  apps: AppItem[];
  activation_cakto_url: string | null;
}

const DURATION_LABEL: Record<Duration, string> = { monthly: 'MENSAL', quarterly: 'TRIMESTRAL', annual: 'ANUAL' };

export default function ResellerActivation() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [app, setApp] = useState<AppItem | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', mac: '', email: '' });
  const [duration, setDuration] = useState<Duration | null>(null);
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
        if (!res.ok) throw new Error(j.error);
        setData(j);
      } catch (e: any) { toast.error(e.message || 'Link inválido'); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  // Poll payment
  useEffect(() => {
    if (!pix || paid) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`${FN_BASE}/reseller-activation-create`, {
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

  const canContinueForm = form.name.trim() && form.phone.trim() &&
    (!app?.requires_mac || form.mac.trim()) && (!app?.requires_email || form.email.trim());

  const currentPrice = app && duration
    ? (duration === 'monthly' ? app.price_monthly : duration === 'quarterly' ? app.price_quarterly : app.price_annual)
    : null;

  const submit = async (method: 'pix' | 'cakto') => {
    if (!app || !duration) return;
    setCreating(true);
    try {
      const res = await fetch(`${FN_BASE}/reseller-activation-create`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create', slug, app_id: app.id, duration, method,
          name: form.name, phone: form.phone, mac: form.mac, email: form.email,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Falha');
      if (j.method === 'cakto' || j.method === 'cakto_card') { window.location.href = j.checkout_url; return; }
      setPix({ txid: j.txid, qr: j.qrcode_base64 || '', copy: j.pix_copia_cola || '', amount: j.amount });
    } catch (e: any) { toast.error(e.message); }
    finally { setCreating(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]"><Loader2 className="w-8 h-8 text-white/60 animate-spin" /></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">Link inválido.</div>;

  const progress = pix ? 100 : (step / 3) * 100;

  return (
    <div style={brandStyle} className="min-h-screen text-white bg-[#0a0a0a] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full blur-3xl" style={{ background: `radial-gradient(closest-side, ${brand}22, transparent 70%)` }} />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link to={`/r/${slug}`} className="text-sm text-white/70 hover:text-white flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
          {data.logo_url ? (
            <img src={data.logo_url} alt="" className="h-8 object-contain" />
          ) : <span className="font-bold" style={{ color: brand }}>{data.display_name}</span>}
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full transition-all duration-500" style={{ width: (pix ? 100 : (step >= i ? 100 : 0)) + '%', background: brand }} />
            </div>
          ))}
        </div>

        {/* ============ Payment result ============ */}
        {pix ? (
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#141414] to-[#0f0f0f] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setPix(null)} className="text-xs text-white/60 hover:text-white flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</button>
              <div className="text-xs text-white/60 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Ambiente seguro</div>
            </div>
            <h2 className="text-center text-lg font-bold">{paid ? 'Pagamento confirmado!' : `Pague ${fmtBRL(pix.amount)} via Pix`}</h2>
            {paid ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500 mx-auto flex items-center justify-center"><Check className="w-10 h-10 text-white" /></div>
                <p className="text-sm text-white/80">Ativação registrada! O revendedor será notificado e liberará sua licença em instantes.</p>
                <Link to={`/r/${slug}`}><Button className="w-full h-11 font-bold text-white" style={{ background: brand }}>Concluir</Button></Link>
              </div>
            ) : (
              <>
                {pix.qr ? (
                  <div className="bg-white p-4 rounded-xl w-fit mx-auto">
                    <img src={pix.qr.startsWith('data:') ? pix.qr : `data:image/png;base64,${pix.qr}`} alt="QR Pix" className="w-56 h-56" />
                  </div>
                ) : (
                  <div className="bg-white/5 rounded-xl h-56 flex items-center justify-center text-white/40 text-sm">QR indisponível — use o código abaixo</div>
                )}
                <div className="bg-black/40 rounded-lg p-3 border border-white/10">
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
              </>
            )}
          </div>
        ) : step === 1 ? (
          /* ============ Step 1: App ============ */
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold">Ativar Licença</h1>
              <p className="text-sm text-white/60">Selecione o aplicativo que deseja ativar</p>
            </div>
            {data.apps.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-white/60">
                <Smartphone className="w-8 h-8 mx-auto mb-2 text-white/30" />
                O revendedor ainda não configurou aplicativos para ativação.
              </div>
            ) : (
              <div className="space-y-2">
                {data.apps.map(a => {
                  const active = app?.id === a.id;
                  return (
                    <button key={a.id} onClick={() => setApp(a)}
                      className={`w-full text-left rounded-xl p-4 border flex items-center gap-3 transition-all ${active ? 'border-[var(--brand)] bg-[var(--brand)]/[0.08] shadow-[0_0_20px_-6px_var(--brand)]' : 'border-white/10 bg-gradient-to-br from-[#141414] to-[#0f0f0f] hover:border-white/25'}`}
                      style={active ? { boxShadow: `0 0 25px -8px ${brand}` } : undefined}>
                      <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                        {a.logo_url ? <img src={a.logo_url} alt="" className="w-full h-full object-contain" /> : <Smartphone className="w-6 h-6 text-white/50" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{a.name}</p>
                        {a.description && <p className="text-xs text-white/60 truncate">{a.description}</p>}
                      </div>
                      {active && <Check className="w-5 h-5" style={{ color: brand }} />}
                    </button>
                  );
                })}
              </div>
            )}
            <Button onClick={() => app && setStep(2)} disabled={!app}
              className="w-full h-12 font-bold text-white disabled:opacity-40" style={{ background: brand }}>
              Continuar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        ) : step === 2 ? (
          /* ============ Step 2: Form ============ */
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold">Seus Dados</h1>
              <p className="text-sm text-white/60">Preencha as informações para ativar o <b style={{ color: brand }}>{app?.name}</b></p>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-white/70">Seu Nome</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Digite seu nome" className="bg-[#111] border-white/10 h-11 mt-1" />
              </div>
              <div>
                <Label className="text-xs text-white/70">Telefone (WhatsApp)</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" className="bg-[#111] border-white/10 h-11 mt-1" />
              </div>
              {app?.requires_mac && (
                <div>
                  <Label className="text-xs text-white/70">Endereço MAC</Label>
                  <Input value={form.mac} onChange={e => setForm(f => ({ ...f, mac: e.target.value.toUpperCase() }))} placeholder="AA:BB:CC:DD:EE:FF" className="bg-[#111] border-white/10 h-11 mt-1 font-mono" />
                </div>
              )}
              {app?.requires_email && (
                <div>
                  <Label className="text-xs text-white/70">E-mail de Cadastro</Label>
                  <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="seu@email.com" className="bg-[#111] border-white/10 h-11 mt-1" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="h-12 bg-transparent border-white/15 hover:bg-white/5">Voltar</Button>
              <Button onClick={() => setStep(3)} disabled={!canContinueForm} className="h-12 font-bold text-white disabled:opacity-40" style={{ background: brand }}>
                Continuar <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        ) : (
          /* ============ Step 3: Plan + Payment ============ */
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold">Escolha o Plano</h1>
              <p className="text-sm text-white/60">Selecione a duração e pague para ativar</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.plans.map(p => {
                const active = plan?.id === p.id;
                return (
                  <button key={p.id} onClick={() => setPlan(p)}
                    className={`rounded-xl border p-4 text-left transition-all ${active ? 'border-[var(--brand)] bg-[var(--brand)]/[0.08]' : 'border-white/10 bg-[#111] hover:border-white/25'}`}>
                    <p className="text-[10px] font-bold tracking-widest text-white/60">{durationLabel(p.duration_days)}</p>
                    <p className="text-xl font-extrabold mt-1"><span className="text-xs text-white/50">R$</span>{Number(p.price).toFixed(2).replace('.', ',')}</p>
                    <p className="text-xs text-white/50 mt-1 truncate">{p.name}</p>
                  </button>
                );
              })}
            </div>

            {plan && (
              <div className="space-y-3 pt-2">
                <p className="text-sm text-white/80 font-semibold">Forma de pagamento:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.methods.efi && (
                    <button onClick={() => submit('pix')} disabled={creating}
                      className="group rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/[0.06] to-transparent hover:border-emerald-400/70 hover:from-emerald-500/[0.12] p-5 flex flex-col items-center gap-2 transition-all disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-[0_0_25px_-6px_rgba(16,185,129,0.6)]">
                      <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center">
                        {creating ? <Loader2 className="w-6 h-6 animate-spin text-emerald-500" /> : <img src={pixLogo.url} alt="Pix" className="w-9 h-9" />}
                      </div>
                      <p className="font-bold text-sm">PIX INSTANTÂNEO</p>
                      <p className="text-xl font-extrabold">{fmtBRL(plan.price)}</p>
                    </button>
                  )}
                  {data.methods.cakto && (plan.card_url || plan.cakto_url) && (
                    <button onClick={() => submit(plan.card_url ? 'cakto_card' : 'cakto')} disabled={creating}
                      className="group rounded-xl border border-white/10 bg-gradient-to-br from-sky-500/[0.06] to-transparent hover:border-sky-400/70 hover:from-sky-500/[0.12] p-5 flex flex-col items-center gap-2 transition-all disabled:opacity-50 hover:-translate-y-0.5">
                      <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center">
                        <img src={cardLogo.url} alt="Cartão" className="w-9 h-9" />
                      </div>
                      <p className="font-bold text-sm">CARTÃO / CAKTO</p>
                      <p className="text-xl font-extrabold">{fmtBRL(plan.price)}</p>
                    </button>
                  )}
                </div>
              </div>
            )}

            <Button variant="outline" onClick={() => setStep(2)} className="w-full h-11 bg-transparent border-white/15 hover:bg-white/5">Voltar</Button>
          </div>
        )}

        <p className="text-center text-[11px] text-white/30 mt-8 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" /> Ativação segura via {data.display_name || 'checkout'}
        </p>
      </div>
    </div>
  );
}
