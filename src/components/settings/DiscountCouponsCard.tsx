import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Ticket, Plus, Trash2, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/lib/error-message';

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}

export default function DiscountCouponsCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: '',
    max_uses: '',
    expires_at: '',
  });

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ['discount-coupons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('discount_coupons' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Coupon[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const code = form.code.trim().toUpperCase();
      const value = parseFloat(form.discount_value);
      if (!code) throw new Error('Informe o código do cupom');
      if (!isFinite(value) || value <= 0) throw new Error('Informe um valor de desconto válido');
      if (form.discount_type === 'percent' && value > 100) throw new Error('O desconto em % não pode passar de 100');

      const { error } = await supabase.from('discount_coupons' as any).insert({
        owner_id: user?.id,
        code,
        discount_type: form.discount_type,
        discount_value: value,
        max_uses: form.max_uses ? parseInt(form.max_uses) : null,
        expires_at: form.expires_at ? new Date(`${form.expires_at}T23:59:59`).toISOString() : null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cupom criado com sucesso');
      setForm({ code: '', discount_type: 'percent', discount_value: '', max_uses: '', expires_at: '' });
      queryClient.invalidateQueries({ queryKey: ['discount-coupons'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('discount_coupons' as any)
        .update({ is_active } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discount-coupons'] }),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('discount_coupons' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cupom removido');
      queryClient.invalidateQueries({ queryKey: ['discount-coupons'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="w-5 h-5 text-primary" />
          Cupons de Desconto
        </CardTitle>
        <CardDescription>
          Crie códigos promocionais que seus clientes podem usar no checkout para ganhar desconto no Pix.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-2">
            <Label>Código</Label>
            <Input
              placeholder="PROMO10"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, '') })}
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Porcentagem (%)</SelectItem>
                <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Desconto</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={form.discount_type === 'percent' ? '10' : '5,00'}
              value={form.discount_value}
              onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Limite de usos</Label>
            <Input
              type="number"
              placeholder="Ilimitado"
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Validade</Label>
            <Input
              type="date"
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            />
          </div>
        </div>

        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Criar cupom
        </Button>

        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando cupons...</p>}
          {!isLoading && coupons.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum cupom criado ainda.</p>
          )}
          {coupons.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold">{c.code}</span>
                  <Badge variant="secondary">
                    {c.discount_type === 'percent'
                      ? `${Number(c.discount_value)}% OFF`
                      : `R$ ${Number(c.discount_value).toFixed(2)} OFF`}
                  </Badge>
                  {!c.is_active && <Badge variant="outline">Desativado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Usos: {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ' (ilimitado)'}
                  {c.expires_at ? ` • Válido até ${new Date(c.expires_at).toLocaleDateString('pt-BR')}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Switch
                  checked={c.is_active}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, is_active: v })}
                />
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
