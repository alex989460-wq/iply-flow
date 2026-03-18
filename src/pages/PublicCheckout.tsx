import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ShoppingCart, User, Phone, Server, Package, ExternalLink } from 'lucide-react';
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
  const [serverId, setServerId] = useState('');
  const [planId, setPlanId] = useState('');

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
      } catch {
        toast({ title: 'Erro ao carregar dados', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId]);

  const selectedPlan = plans.find(p => p.id === planId);

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !username.trim() || !serverId || !planId || !selectedPlan) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Save pending new customer
      const phoneDigits = phone.replace(/\D/g, '');
      const phoneNormalized = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;

      const { error } = await supabase.from('pending_new_customers' as any).insert({
        owner_id: userId,
        name: name.trim(),
        phone: phoneNormalized,
        username: username.trim(),
        server_id: serverId,
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border/50 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <ShoppingCart className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Nova Assinatura</CardTitle>
          {ownerName && (
            <CardDescription className="text-base">{ownerName}</CardDescription>
          )}
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
              <Input
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="(41) 99999-9999"
                required
                className="bg-secondary/30"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" /> Usuário Desejado
              </Label>
              <Input
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                placeholder="meususuario"
                required
                className="bg-secondary/30"
              />
            </div>

            {servers.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Server className="w-4 h-4" /> Servidor
                </Label>
                <Select value={serverId} onValueChange={setServerId} required>
                  <SelectTrigger className="bg-secondary/30">
                    <SelectValue placeholder="Selecione o servidor" />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.server_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Package className="w-4 h-4" /> Plano
              </Label>
              <Select value={planId} onValueChange={setPlanId} required>
                <SelectTrigger className="bg-secondary/30">
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.plan_name} - R$ {Number(p.price).toFixed(2)} ({p.duration_days} dias)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPlan && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
                <p className="text-sm text-muted-foreground">Valor do plano</p>
                <p className="text-2xl font-bold text-primary">
                  R$ {Number(selectedPlan.price).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedPlan.plan_name} • {selectedPlan.duration_days} dias
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={submitting || !name || !phone || !username || !serverId || !planId}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              Ir para Pagamento
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
