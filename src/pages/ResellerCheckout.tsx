import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Check, Phone, CreditCard, QrCode, ArrowLeft, Copy, ExternalLink, Sparkles, ShieldCheck, Tv, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface Plan { id: string; name: string; duration_days: number; price: number; cakto_url: string | null; }
interface Customer { id: string; name: string; username: string; due_date: string; status: string; current_plan: string | null; screens: number; }
interface CheckoutData {
  slug: string; display_name: string | null; logo_url: string | null; brand_color: string;
  headline: string | null; subheadline: string | null;
  methods: { efi: boolean; cakto: boolean };
  plans: Plan[];
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function fmtBRL(n: number) { return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function label(days: number) {
  if (days <= 31) return 'MENSAL';
  if (days <= 92) return 'TRIMESTRAL';
  if (days <= 186) return 'SEMESTRAL';
  return 'ANUAL';
}
function extractScreens(name: string): number | null {
  const m = name?.match(/(\d+)\s*(telas?|tela|screens?|dispositivos?|conex[õo]es|pontos?)/i);
  if (m) return parseInt(m[1], 10);
  const m2 = name?.match(/\b([1-9])\s*t\b/i);
  return m2 ? parseInt(m2[1], 10) : null;
}

export default function ResellerCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
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
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  // Poll Pix status
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
  const brandStyle = useMemo(() => ({
    '--brand': brand,
  } as React.CSSProperties), [brand]);

  const searchPhone = async () => {
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
      setCustomers(j.customers || []);
      if (!j.customers?.length) toast.warning('Nenhum usuário encontrado para esse telefone.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  };

  const startPayment = async (method: 'pix' | 'cakto') => {
    if (!selectedCustomer || !selectedPlan) return;
    setCreating(true);
    try {
      const res = await fetch(`${FN_BASE}/reseller-checkout-charge`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create', slug,
          customer_id: selectedCustomer.id,
          plan_id: selectedPlan.id,
          method,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Falha ao gerar cobrança');
      if (j.method === 'cakto') {
        window.location.href = j.checkout_url;
        return;
      }
      setPix({ txid: j.txid, qr: j.qrcode_base64, copy: j.pix_copia_cola, amount: j.amount });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const reset = () => {
    setPix(null); setPaid(false); setSelectedPlan(null); setSelectedCustomer(null); setCustomers(null); setPhone('');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-black"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>;
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white">Link inválido ou desativado.</div>;
  }

  return (
    <div style={brandStyle} className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="pt-10 pb-6 text-center">
        {data.logo_url ? (
          <img src={data.logo_url} alt={data.display_name || ''} className="h-16 mx-auto object-contain" />
        ) : (
          <h1 className="text-3xl font-extrabold" style={{ color: brand }}>{data.display_name || 'Assinatura'}</h1>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-16 space-y-8">
        {/* Sucesso Pix */}
        {paid && (
          <Card className="border-emerald-500/40 bg-emerald-500/10 text-white">
            <CardContent className="p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500 mx-auto flex items-center justify-center">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold">Pagamento confirmado!</h2>
              <p className="text-sm text-white/80">Sua renovação foi processada. Em instantes seu acesso é liberado.</p>
              <Button onClick={reset} variant="outline" className="mt-2 text-black">Nova renovação</Button>
            </CardContent>
          </Card>
        )}

        {/* Pix QR */}
        {!paid && pix && (
          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setPix(null)} className="text-sm text-white/60 hover:text-white flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                <div className="text-sm text-white/60 flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Ambiente seguro</div>
              </div>
              <h2 className="text-xl font-bold text-center">Pague {fmtBRL(pix.amount)} para renovar</h2>
              {pix.qr && (
                <div className="bg-white p-4 rounded-xl w-fit mx-auto">
                  <img src={`data:image/png;base64,${pix.qr}`} alt="QR Code Pix" className="w-64 h-64" />
                </div>
              )}
              <div className="bg-black/40 rounded-lg p-3">
                <p className="text-xs text-white/60 mb-2">Ou copie e cole o código Pix:</p>
                <div className="flex gap-2">
                  <Input readOnly value={pix.copy} className="text-xs bg-black/60 border-white/10" />
                  <Button
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(pix.copy); toast.success('Copiado!'); }}
                    style={{ background: brand }}
                  ><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
              <p className="text-center text-sm text-white/60 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Aguardando pagamento...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Escolha do plano */}
        {!pix && !paid && selectedCustomer && (
          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-6 md:p-8 space-y-6">
              <button onClick={() => { setSelectedCustomer(null); setSelectedPlan(null); }}
                className="text-sm text-white/60 hover:text-white flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Trocar usuário
              </button>
              <div className="text-center">
                <p className="text-white/60 text-sm">Renovando</p>
                <p className="text-xl font-bold" style={{ color: brand }}>{selectedCustomer.username}</p>
                <p className="text-xs text-white/60">Vencimento atual: {new Date(selectedCustomer.due_date).toLocaleDateString('pt-BR')}</p>
              </div>

              {!selectedPlan && (
                <>
                  <div className="text-center flex items-center justify-center gap-2 text-sm text-white/80">
                    <Sparkles className="w-4 h-4" style={{ color: brand }} /> Escolha o plano de renovação
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {data.plans.map((p, i) => {
                      const isPopular = i === 1 && data.plans.length >= 3;
                      const telas = extractScreens(p.name);
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPlan(p)}
                          className="group relative text-left rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-white/[0.1] hover:to-white/[0.04] border border-white/10 hover:border-[var(--brand)] p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[var(--brand)]/20"
                        >
                          {isPopular && (
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full text-white shadow-lg" style={{ background: brand }}>
                              MAIS POPULAR
                            </span>
                          )}
                          <p className="text-xs text-white/60 font-semibold tracking-wider">{label(p.duration_days)}</p>
                          <p className="text-3xl font-extrabold mt-2">
                            <span className="text-sm text-white/60 align-top mr-1">R$</span>{Number(p.price).toFixed(2).replace('.', ',')}
                          </p>
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">{p.duration_days} dias</span>
                            {telas && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)]/20 text-white flex items-center gap-1 font-semibold">
                                <Tv className="w-3 h-3" /> {telas} {telas === 1 ? 'tela' : 'telas'}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {selectedPlan && (
                <div className="space-y-5">
                  <button onClick={() => setSelectedPlan(null)} className="text-sm text-white/60 hover:text-white flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Trocar plano
                  </button>
                  <div className="text-center py-2">
                    <p className="text-white/60 text-sm">Total a pagar</p>
                    <p className="text-5xl font-extrabold mt-1" style={{ color: brand }}>{fmtBRL(Number(selectedPlan.price))}</p>
                    <p className="text-xs text-white/50 mt-1">
                      {selectedPlan.name} • {selectedPlan.duration_days} dias
                      {extractScreens(selectedPlan.name) ? ` • ${extractScreens(selectedPlan.name)} telas` : ''}
                    </p>
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-xs uppercase tracking-wider text-white/50 text-center font-semibold">Escolha como pagar</p>

                    {data.methods.efi && (
                      <button
                        onClick={() => startPayment('pix')}
                        disabled={creating}
                        className="w-full group relative overflow-hidden rounded-2xl p-4 border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 hover:from-emerald-500/25 hover:to-emerald-500/10 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-wait text-left"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                            {creating ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <QrCode className="w-6 h-6 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-white flex items-center gap-2">Pix instantâneo <Zap className="w-3.5 h-3.5 text-emerald-300" /></p>
                            <p className="text-xs text-white/60">QR Code na hora • aprovação em segundos</p>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">RECOMENDADO</span>
                        </div>
                      </button>
                    )}

                    {data.methods.cakto && selectedPlan.cakto_url && (
                      <button
                        onClick={() => startPayment('cakto')}
                        disabled={creating}
                        className="w-full group relative overflow-hidden rounded-2xl p-4 border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-white/[0.12] hover:to-white/[0.04] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-wait text-left"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                            <CreditCard className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-white flex items-center gap-2">Cartão, boleto ou Pix <ExternalLink className="w-3.5 h-3.5 text-white/60" /></p>
                            <p className="text-xs text-white/60">Checkout Cakto • parcele em até 12x no cartão</p>
                          </div>
                        </div>
                      </button>
                    )}

                    {!data.methods.efi && !(data.methods.cakto && selectedPlan.cakto_url) && (
                      <p className="text-center text-sm text-white/60 py-4">Nenhum método de pagamento disponível. Entre em contato com o suporte.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Lista de usuários */}
        {!pix && !paid && !selectedCustomer && customers && customers.length > 0 && (
          <Card className="border-white/10 bg-white/5">
            <CardContent className="p-6 space-y-4">
              <button onClick={() => setCustomers(null)} className="text-sm text-white/60 hover:text-white flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              <h2 className="text-lg font-bold text-center">Selecione o usuário para renovar</h2>
              <div className="space-y-2">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomer(c)}
                    className="w-full text-left flex items-center justify-between bg-black/40 hover:bg-black/60 border border-white/10 hover:border-[var(--brand)] rounded-xl p-4 transition-all"
                  >
                    <div>
                      <p className="font-bold">{c.username || c.name}</p>
                      <p className="text-xs text-white/60">
                        {c.current_plan || 'Sem plano'} • Vence {new Date(c.due_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10">{c.status}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Etapa 1: informar telefone */}
        {!pix && !paid && !customers && (
          <>
            <section className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold border" style={{ borderColor: brand, color: brand }}>
                <Sparkles className="w-3.5 h-3.5" /> {data.headline || 'ÁREA DO CLIENTE'}
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold">
                Renove seu <span style={{ color: brand }}>plano</span>
              </h1>
              <p className="text-white/60">{data.subheadline || 'Informe seu telefone para localizar sua conta e escolher o plano.'}</p>
            </section>

            <Card className="border-white/10 bg-white/5 max-w-md mx-auto">
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-white/70 flex items-center gap-2"><Phone className="w-4 h-4" /> Telefone cadastrado</label>
                  <Input
                    inputMode="tel"
                    placeholder="DDD + número"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchPhone()}
                    className="h-12 bg-black/40 border-white/10 text-white"
                  />
                </div>
                <Button onClick={searchPhone} disabled={searching} className="w-full h-12 text-base font-bold" style={{ background: brand }}>
                  {searching ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                  Continuar
                </Button>
                <p className="text-xs text-white/50 text-center">Usamos seu telefone somente para localizar seu acesso.</p>
              </CardContent>
            </Card>

            {/* Vitrine dos planos (informativa) */}
            {data.plans.length > 0 && (
              <section className="space-y-4">
                <h3 className="text-center text-lg font-bold text-white/80">Planos disponíveis</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {data.plans.map((p, i) => (
                    <div key={p.id} className="rounded-2xl bg-black/40 border border-white/10 p-5">
                      <p className="text-xs text-white/60 font-semibold tracking-wider">{label(p.duration_days)}</p>
                      <p className="text-3xl font-extrabold mt-2">
                        <span className="text-sm text-white/60 align-top mr-1">R$</span>{Number(p.price).toFixed(2).replace('.', ',')}
                      </p>
                      <p className="text-xs text-white/50 mt-2">{p.duration_days} dias</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="text-center text-xs text-white/40 pt-8">
          Pagamento processado com segurança. {data.methods.efi && 'Pix instantâneo via Efí.'}
        </footer>
      </main>
    </div>
  );
}
