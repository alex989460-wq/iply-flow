import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !username.trim() || !planId || !selectedPlan) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Save pending new customer
      // PhoneInput já entrega dígitos com DDI. Só prefixa 55 se não houver DDI nenhum (compat).
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneNormalized = phoneDigits.length >= 11 ? phoneDigits : '55' + phoneDigits;

      // Prefer the server detected during username verification (vplay/natv).
      // Fallback to first available server if none was detected.
      const detectedServerId =
        verifyResult.status === 'ok' && verifyResult.server_id ? verifyResult.server_id : null;

      const { error } = await supabase.from('pending_new_customers' as any).insert({
        owner_id: userId,
        name: name.trim(),
        phone: phoneNormalized,
        username: username.trim(),
        server_id: detectedServerId || (servers.length > 0 ? servers[0].id : null),
        plan_id: planId,
        checkout_url: selectedPlan.checkout_url,
      });

      if (error) throw error;

      // Redirect to Cakto checkout
      window.location.href = selectedPlan.checkout_url;
    } catch (err: any) {
      toast({ title: 'Erro ao processar', description: err.message, variant: 'destructive' });
      setSubmitting(false);
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
                'Ir para Pagamento'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
