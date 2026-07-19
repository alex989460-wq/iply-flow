import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { normalizeWhatsAppPhone } from '@/lib/phone';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, ShoppingCart, User, Phone, Package, ExternalLink, Check, AlertCircle, CheckCircle2, QrCode, Copy } from 'lucide-react';

import { useToast } from '@/hooks/use-toast';

interface PublicServer {
  id: string;
  server_name: string;
}

interface PublicPlan {
  id: string;
  plan_name: string;
  duration_days: number;
  price: number;
  checkout_url: string;
}

export default function PublicCheckout() {
  const { userId } = useParams<{ userId: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [ownerName, setOwnerName] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [planId, setPlanId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<
    | { status: 'idle' }
    | { status: 'ok'; name: string; due_date: string | null; server_id?: string | null; source?: string }
    | { status: 'notfound' }
    | { status: 'error' }
  >({ status: 'idle' });


  // Efí Pix
  const [efiEnabled, setEfiEnabled] = useState(false);
  const [efiSubmitting, setEfiSubmitting] = useState(false);
  const [efiCharge, setEfiCharge] = useState<
    | null
    | { txid: string; qrcode_base64: string; pix_copia_cola: string; amount: number; status: 'pending' | 'paid' | 'expired' | 'cancelled' }
  >(null);
  const pollRef = useRef<number | null>(null);


  useEffect(() => {
    if (!userId) return;
    const fetchData = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/public-checkout-data?owner_id=${userId}`,
          { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const data = await resp.json();
        setServers(data.servers || []);
        setPlans(data.plans || []);
        setOwnerName(data.owner_name || '');

        // Ask whether this owner has Efí Pix enabled — silent, best-effort.
        try {
          const { data: efi } = await supabase.functions.invoke('efi-pix-public', {
            body: { action: 'is-enabled', owner_id: userId },
          });
          setEfiEnabled(!!efi?.enabled);
        } catch {
          setEfiEnabled(false);
        }
      } catch {
        toast({ title: 'Erro ao carregar dados', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  // Debounced username verification
  useEffect(() => {
    const u = username.trim();
    if (!u || !userId) {
      setVerifyResult({ status: 'idle' });
      setVerifying(false);
      return;
    }
    setVerifying(true);
    const handle = setTimeout(async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const resp = await fetch(
          `https://${projectId}.supabase.co/functions/v1/verify-checkout-username?owner_id=${userId}&username=${encodeURIComponent(u)}`,
          { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
        );
        const data = await resp.json();
        if (data.found) {
          setVerifyResult({
            status: 'ok',
            name: data.customer.name,
            due_date: data.customer.due_date,
            server_id: data.server_id ?? null,
            source: data.source,
          });
        } else {
          setVerifyResult({ status: 'notfound' });
        }
      } catch {
        setVerifyResult({ status: 'error' });
      } finally {
        setVerifying(false);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [username, userId]);

  const selectedPlan = plans.find(p => p.id === planId);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const validateForm = () => {
    if (!name.trim() || !phone.trim() || !username.trim() || !planId || !selectedPlan) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return false;
    }
    return true;
  };

  /** Insert the pending_new_customers row and return its id. Shared by both providers. */
  const createPendingRow = async (): Promise<string | null> => {
    const phoneNormalized = normalizeWhatsAppPhone(phone);
    const detectedServerId =
      verifyResult.status === 'ok' && verifyResult.server_id ? verifyResult.server_id : null;

    // 🚫 Bloqueia cadastro duplicado: se o verify já detectou que o usuário existe como cliente deste
    // revendedor, não pode se cadastrar novamente. Precisa renovar pelo fluxo de cliente existente.
    const uname = username.trim();
    if (verifyResult.status === 'ok' && verifyResult.source === 'customer') {
      toast({
        title: 'Usuário já cadastrado',
        description: `O usuário "${uname}" já existe. Faça a renovação pelo checkout de cliente existente.`,
        variant: 'destructive',
      });
      throw new Error('duplicate_username');
    }

    const { data, error } = await (supabase
      .from('pending_new_customers' as any)
      .insert({
        owner_id: userId,
        name: name.trim(),
        phone: phoneNormalized,
        username: uname,
        server_id: detectedServerId || (servers.length > 0 ? servers[0].id : null),
        plan_id: planId,
        checkout_url: selectedPlan?.checkout_url || '',
      })
      .select('id')
      .single() as any);
    if (error) throw error;
    return data?.id || null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      await createPendingRow();
      // Redirect to Cakto checkout
      window.location.href = selectedPlan!.checkout_url;
    } catch (err: any) {
      toast({ title: 'Erro ao processar', description: err.message, variant: 'destructive' });
      setSubmitting(false);
    }
  };

  const payWithEfi = async () => {
    if (!validateForm()) return;
    setEfiSubmitting(true);
    try {
      const pendingId = await createPendingRow();
      if (!pendingId) throw new Error('Não foi possível registrar seu pedido.');

      // Call Efí via direct fetch so we can read the error body from the edge function
      // (supabase.functions.invoke swallows non-2xx bodies into a generic message).
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/efi-pix-public`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            action: 'create-charge-for-pending',
            owner_id: userId,
            pending_id: pendingId,
          }),
        },
      );
      const raw = await resp.text();
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = { error: raw }; }
      if (!resp.ok || data?.error) {
        const msg = data?.error
          ? typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
          : `HTTP ${resp.status}`;
        throw new Error(msg);
      }
      setEfiCharge({
        txid: data.txid,
        qrcode_base64: data.qrcode_base64,
        pix_copia_cola: data.pix_copia_cola,
        amount: data.amount,
        status: 'pending',
      });
    } catch (err: any) {
      const raw = String(err?.message || err || '');
      // Skip double toast — createPendingRow already showed a friendly message for these.
      if (raw === 'duplicate_username') { setEfiSubmitting(false); return; }
      let friendly = raw;
      if (raw.startsWith('duplicate_pending_username')) {
        friendly = 'Já existe um pedido pendente com este usuário. Aguarde ou entre em contato com o revendedor.';
      } else if (raw.startsWith('duplicate_customer_username')) {
        friendly = 'Este usuário já está cadastrado. Use o checkout de renovação.';
      } else if (raw === 'efi_not_enabled_for_owner') {
        friendly = 'Pagamento via Pix indisponível no momento.';
      } else if (raw === 'plan_price_invalid' || raw === 'plan_not_found') {
        friendly = 'Plano indisponível. Recarregue a página e tente novamente.';
      } else if (raw === 'cob_failed') {
        friendly = 'A operadora Pix recusou a cobrança. Tente novamente em instantes.';
      }
      toast({ title: 'Erro ao gerar Pix', description: friendly, variant: 'destructive' });
    } finally {
      setEfiSubmitting(false);
    }
  };

  // Poll charge status while dialog is open and status is still pending.
  useEffect(() => {
    if (!efiCharge || efiCharge.status !== 'pending') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('efi-pix-public', {
          body: { action: 'poll', txid: efiCharge.txid },
        });
        if (data?.status && data.status !== 'pending') {
          setEfiCharge(c => c ? { ...c, status: data.status } : c);
          if (data.status === 'paid') {
            toast({ title: 'Pagamento confirmado!', description: 'Sua assinatura foi ativada.' });
          }
        }
      } catch { /* ignore transient errors */ }
    }, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [efiCharge?.txid, efiCharge?.status]);

  const copyPix = async () => {
    if (!efiCharge?.pix_copia_cola) return;
    try {
      await navigator.clipboard.writeText(efiCharge.pix_copia_cola);
      toast({ title: 'Copiado!', description: 'Cole no app do seu banco.' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">Nenhum plano disponível no momento.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.15),transparent_60%),radial-gradient(ellipse_at_bottom,hsl(var(--primary)/0.08),transparent_50%)] bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border/40 shadow-2xl backdrop-blur-sm bg-card/80 rounded-2xl">
        <CardHeader className="text-center pb-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/30">
            <ShoppingCart className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">Nova Assinatura</CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Preencha seus dados para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" /> Nome Completo
              </Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome completo"
                required
                className="bg-secondary/30"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="w-4 h-4" /> Telefone (WhatsApp)
              </Label>
              <PhoneInput
                value={phone.replace(/\D/g, '')}
                onChange={(digits) => setPhone(digits)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" /> Nome de usuário recebido no teste
              </Label>
              <div className="relative">
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                  placeholder="Digite o usuário que você recebeu no teste"
                  required
                  className={`bg-secondary/30 pr-10 ${
                    verifyResult.status === 'ok' ? 'border-green-500/60' :
                    verifyResult.status === 'notfound' ? 'border-destructive/60' : ''
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {verifying && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  {!verifying && verifyResult.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {!verifying && verifyResult.status === 'notfound' && <AlertCircle className="w-4 h-4 text-destructive" />}
                </div>
              </div>
              {!verifying && verifyResult.status === 'ok' && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Usuário encontrado: <span className="font-semibold">{verifyResult.name}</span>
                </p>
              )}
              {!verifying && verifyResult.status === 'notfound' && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Usuário não encontrado. Verifique se digitou corretamente o usuário recebido no teste.
                </p>
              )}
              {!verifying && verifyResult.status === 'error' && (
                <p className="text-xs text-muted-foreground">Não foi possível verificar agora.</p>
              )}
            </div>



            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Package className="w-4 h-4" /> Escolha seu plano
              </Label>
              <div className="grid gap-2">
                {plans.map(p => {
                  const isSelected = planId === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setPlanId(p.id)}
                      className={`group relative flex items-center justify-between rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary))]'
                          : 'border-border/60 bg-secondary/20 hover:border-primary/40 hover:bg-secondary/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                        </div>
                        <div>
                          <p className="font-semibold leading-tight">{p.plan_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.duration_days} dias</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          R$ {Number(p.price).toFixed(2)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>


            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={
                submitting || !name || !phone || !username || !planId ||
                verifying || verifyResult.status !== 'ok'
              }
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              {verifying ? 'Verificando usuário...' :
                verifyResult.status === 'notfound' ? 'Usuário inválido' :
                'Pagar com Cartão / Cakto'}
            </Button>

            {efiEnabled && (
              <>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-3 text-xs text-muted-foreground uppercase tracking-wider">ou</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-emerald-500/40 hover:bg-emerald-500/10"
                  size="lg"
                  onClick={payWithEfi}
                  disabled={
                    efiSubmitting || submitting || !name || !phone || !username || !planId ||
                    verifying || verifyResult.status !== 'ok'
                  }
                >
                  {efiSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
                  Pagar com Pix (Efí)
                </Button>
              </>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Efí Pix dialog */}
      <Dialog open={!!efiCharge} onOpenChange={(o) => { if (!o) setEfiCharge(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-500" /> Pague com Pix
            </DialogTitle>
            <DialogDescription>
              {efiCharge?.status === 'paid'
                ? 'Pagamento confirmado! Sua assinatura foi ativada.'
                : `Valor: R$ ${efiCharge?.amount?.toFixed(2)} — escaneie o QR ou copie o código.`}
            </DialogDescription>
          </DialogHeader>
          {efiCharge?.status === 'paid' ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </div>
              <p className="text-sm text-center text-muted-foreground">Você já pode fechar esta janela.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {efiCharge?.qrcode_base64 && (
                <div className="flex justify-center">
                  <img src={efiCharge.qrcode_base64} alt="QR Code Pix" className="w-56 h-56 rounded-lg border border-border/60 bg-white p-2" />
                </div>
              )}
              {efiCharge?.pix_copia_cola && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Pix copia-e-cola</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={efiCharge.pix_copia_cola} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={copyPix}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Aguardando confirmação do pagamento…
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>

  );
}
