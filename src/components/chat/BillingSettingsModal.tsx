import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CreditCard, Save, Loader2 } from 'lucide-react';

interface BillingSettings {
  id?: string;
  user_id: string;
  pix_key: string;
  pix_key_type: string;
  monthly_price: number;
  quarterly_price: number;
  semiannual_price: number;
  annual_price: number;
  custom_message: string | null;
  vplay_integration_url: string | null;
  vplay_key_message: string | null;
  meta_template_name: string | null;
}

interface BillingSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BillingSettingsModal({ open, onOpenChange }: BillingSettingsModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<Partial<BillingSettings>>({
    pix_key: '',
    pix_key_type: 'celular',
    monthly_price: 35,
    quarterly_price: 90,
    semiannual_price: 175,
    annual_price: 300,
    custom_message: '',
    vplay_integration_url: '',
    vplay_key_message: 'XCLOUD',
    meta_template_name: 'pedido_aprovado',
  });

  // Fetch user's billing settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['billing-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase
        .from('billing_settings' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle() as any);
      if (error) throw error;
      return data as BillingSettings | null;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        pix_key: settings.pix_key || '',
        pix_key_type: settings.pix_key_type || 'celular',
        monthly_price: settings.monthly_price || 35,
        quarterly_price: settings.quarterly_price || 90,
        semiannual_price: settings.semiannual_price || 175,
        annual_price: settings.annual_price || 300,
        custom_message: settings.custom_message || '',
        vplay_integration_url: (settings as any).vplay_integration_url || '',
        vplay_key_message: (settings as any).vplay_key_message || 'XCLOUD',
        meta_template_name: (settings as any).meta_template_name || 'pedido_aprovado',
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<BillingSettings>) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      if (settings?.id) {
        // Update existing
        const { error } = await supabase
          .from('billing_settings' as any)
          .update({
            pix_key: data.pix_key,
            pix_key_type: data.pix_key_type,
            monthly_price: data.monthly_price,
            quarterly_price: data.quarterly_price,
            semiannual_price: data.semiannual_price,
            annual_price: data.annual_price,
            custom_message: data.custom_message,
            vplay_integration_url: data.vplay_integration_url || null,
            vplay_key_message: data.vplay_key_message || 'XCLOUD',
            meta_template_name: data.meta_template_name || 'pedido_aprovado',
          })
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('billing_settings' as any)
          .insert({
            user_id: user.id,
            pix_key: data.pix_key,
            pix_key_type: data.pix_key_type,
            monthly_price: data.monthly_price,
            quarterly_price: data.quarterly_price,
            semiannual_price: data.semiannual_price,
            annual_price: data.annual_price,
            custom_message: data.custom_message,
            vplay_integration_url: data.vplay_integration_url || null,
            vplay_key_message: data.vplay_key_message || 'XCLOUD',
            meta_template_name: data.meta_template_name || 'pedido_aprovado',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-settings'] });
      toast.success('Configurações salvas com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      console.error('Error saving billing settings:', error);
      toast.error('Erro ao salvar configurações');
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const pixKeyTypes = [
    { value: 'celular', label: 'Celular' },
    { value: 'cpf', label: 'CPF' },
    { value: 'cnpj', label: 'CNPJ' },
    { value: 'email', label: 'E-mail' },
    { value: 'aleatoria', label: 'Chave Aleatória' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Configurar PIX e Preços
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* PIX Key Section */}
            <div className="space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <h4 className="text-sm font-semibold text-primary">Chave PIX</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo da Chave</Label>
                  <Select
                    value={formData.pix_key_type}
                    onValueChange={(v) => setFormData({ ...formData, pix_key_type: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pixKeyTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Chave</Label>
                  <Input
                    placeholder="Sua chave PIX"
                    value={formData.pix_key}
                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* Prices Section */}
            <div className="space-y-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <h4 className="text-sm font-semibold text-emerald-500">Preços dos Pacotes</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mensal</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.monthly_price}
                      onChange={(e) => setFormData({ ...formData, monthly_price: parseFloat(e.target.value) || 0 })}
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Trimestral</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.quarterly_price}
                      onChange={(e) => setFormData({ ...formData, quarterly_price: parseFloat(e.target.value) || 0 })}
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Semestral</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.semiannual_price}
                      onChange={(e) => setFormData({ ...formData, semiannual_price: parseFloat(e.target.value) || 0 })}
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Anual</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.annual_price}
                      onChange={(e) => setFormData({ ...formData, annual_price: parseFloat(e.target.value) || 0 })}
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Message */}
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem Personalizada (opcional)</Label>
              <Textarea
                placeholder="Mensagem adicional que aparecerá no final da cobrança..."
                value={formData.custom_message || ''}
                onChange={(e) => setFormData({ ...formData, custom_message: e.target.value })}
                className="min-h-[60px] text-sm"
              />
            </div>

            {/* Meta Template Config */}
            <div className="space-y-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <h4 className="text-sm font-semibold text-blue-500">Template WhatsApp (Pagamento Aprovado)</h4>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do Template</Label>
                <Input
                  placeholder="pedido_aprovado"
                  value={formData.meta_template_name || ''}
                  onChange={(e) => setFormData({ ...formData, meta_template_name: e.target.value })}
                  className="h-9 text-sm font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  Nome exato do template aprovado no Meta Business. Variáveis enviadas: {'{{1}}'} Nome, {'{{2}}'} Usuário, {'{{3}}'} Servidor, {'{{4}}'} Vencimento. Botão URL dinâmica: {'{{1}}'} = ID da confirmação.
                </p>
              </div>
            </div>

            {/* Vplay Integration */}
            <div className="space-y-3 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
              <h4 className="text-sm font-semibold text-violet-500">Integração Vplay (Teste Automático)</h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">URL de Integração</Label>
                  <Input
                    placeholder="https://gestorvplay.com/chatbot/1474"
                    value={formData.vplay_integration_url || ''}
                    onChange={(e) => setFormData({ ...formData, vplay_integration_url: e.target.value })}
                    className="h-9 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Cole aqui a URL de integração do seu Gestor Vplay.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mensagem Chave (Padrão)</Label>
                  <Input
                    placeholder="XCLOUD, XC, HD..."
                    value={formData.vplay_key_message || ''}
                    onChange={(e) => setFormData({ ...formData, vplay_key_message: e.target.value.toUpperCase() })}
                    className="h-9 text-sm font-mono uppercase"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Ex: XCLOUD, XC, HD. Será usada para gerar os testes.
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}