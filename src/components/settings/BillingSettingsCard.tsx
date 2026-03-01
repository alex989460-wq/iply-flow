import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Save, Loader2, Upload, Trash2, ImageIcon } from 'lucide-react';

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
  notification_phone: string | null;
  renewal_message_template: string | null;
  renewal_image_url: string | null;
}

const DEFAULT_RENEWAL_TEMPLATE = `✅ Olá, *{{nome}}*. Obrigado por confirmar seu pagamento. Segue abaixo os dados da sua assinatura:

==========================
📅 Próx. Vencimento: *{{vencimento}} - {{hora}} hrs*
💰 Valor: *{{valor}}*
👤 Usuário: *{{usuario}}*
📦 Plano: *{{plano}}*
🔌 Status: *Ativo*
💎 Obs: -
⚡: *{{servidor}}*
==========================`;

export default function BillingSettingsCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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
    notification_phone: '',
    renewal_message_template: '',
    renewal_image_url: '',
  });

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
        notification_phone: (settings as any).notification_phone || '',
        renewal_message_template: (settings as any).renewal_message_template || '',
        renewal_image_url: (settings as any).renewal_image_url || '',
      });
    }
  }, [settings]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione apenas imagens (PNG, JPG, etc.)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande (máx 5MB)');
      return;
    }

    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${user.id}/renewal-image.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('reseller-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('reseller-assets')
        .getPublicUrl(filePath);

      const imageUrl = urlData.publicUrl + '?t=' + Date.now();
      setFormData(prev => ({ ...prev, renewal_image_url: imageUrl }));
      toast.success('Imagem enviada com sucesso!');
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(err.message || 'Erro ao enviar imagem');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, renewal_image_url: '' }));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<BillingSettings>) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const payload = {
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
        notification_phone: data.notification_phone || '',
        renewal_message_template: data.renewal_message_template || null,
        renewal_image_url: data.renewal_image_url || '',
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('billing_settings' as any)
          .update(payload)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('billing_settings' as any)
          .insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-settings'] });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Error saving billing settings:', error);
      toast.error('Erro ao salvar configurações');
    },
  });

  const pixKeyTypes = [
    { value: 'celular', label: 'Celular' },
    { value: 'cpf', label: 'CPF' },
    { value: 'cnpj', label: 'CNPJ' },
    { value: 'email', label: 'E-mail' },
    { value: 'aleatoria', label: 'Chave Aleatória' },
  ];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* PIX & Prices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">💳 Chave PIX e Preços</CardTitle>
          <CardDescription>Configure sua chave PIX e os preços dos planos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Tipo da Chave PIX</Label>
              <Select
                value={formData.pix_key_type}
                onValueChange={(v) => setFormData({ ...formData, pix_key_type: v })}
              >
                <SelectTrigger>
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
            <div className="space-y-2">
              <Label className="text-sm">Chave PIX</Label>
              <Input
                placeholder="Sua chave PIX"
                value={formData.pix_key}
                onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'monthly_price', label: 'Mensal' },
              { key: 'quarterly_price', label: 'Trimestral' },
              { key: 'semiannual_price', label: 'Semestral' },
              { key: 'annual_price', label: 'Anual' },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={(formData as any)[key]}
                    onChange={(e) => setFormData({ ...formData, [key]: parseFloat(e.target.value) || 0 })}
                    className="pl-8"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notification & Renewal Message */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📞 Notificações e Mensagem de Renovação</CardTitle>
          <CardDescription>Configure o telefone que receberá confirmações e personalize a mensagem enviada ao cliente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Telefone para Notificações</Label>
            <Input
              placeholder="5541999999999"
              value={formData.notification_phone || ''}
              onChange={(e) => setFormData({ ...formData, notification_phone: e.target.value.replace(/\D/g, '') })}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Número com DDD (ex: 5541999999999). Receberá notificações de cada renovação manual e automática.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Mensagem de Renovação (Template)</Label>
            <Textarea
              placeholder={DEFAULT_RENEWAL_TEMPLATE}
              value={formData.renewal_message_template || ''}
              onChange={(e) => setFormData({ ...formData, renewal_message_template: e.target.value })}
              className="min-h-[150px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis: {'{{nome}}'}, {'{{vencimento}}'}, {'{{hora}}'}, {'{{valor}}'}, {'{{usuario}}'}, {'{{plano}}'}, {'{{servidor}}'}. Deixe vazio para mensagem padrão.
            </p>
          </div>

          {/* Renewal Image */}
          <div className="space-y-2">
            <Label className="text-sm">Imagem de Confirmação (opcional)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Enviada junto com a mensagem de renovação no WhatsApp. Ideal para logos ou banners personalizados.
            </p>
            
            {formData.renewal_image_url ? (
              <div className="relative inline-block">
                <img
                  src={formData.renewal_image_url}
                  alt="Imagem de renovação"
                  className="max-w-[300px] max-h-[200px] rounded-lg border border-border object-contain"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={handleRemoveImage}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                {uploadingImage ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para enviar uma imagem</span>
                    <span className="text-xs text-muted-foreground">PNG, JPG (máx 5MB)</span>
                  </>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Template & Vplay */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">⚙️ Template e Integrações</CardTitle>
          <CardDescription>Template do WhatsApp para pagamento aprovado e integração Vplay</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Nome do Template (Meta Business)</Label>
            <Input
              placeholder="pedido_aprovado"
              value={formData.meta_template_name || ''}
              onChange={(e) => setFormData({ ...formData, meta_template_name: e.target.value })}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Nome exato do template aprovado no Meta Business. Variáveis: {'{{1}}'} Nome, {'{{2}}'} Usuário, {'{{3}}'} Servidor, {'{{4}}'} Vencimento.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">URL Integração Vplay</Label>
              <Input
                placeholder="https://gestorvplay.com/chatbot/1474"
                value={formData.vplay_integration_url || ''}
                onChange={(e) => setFormData({ ...formData, vplay_integration_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Mensagem Chave Vplay</Label>
              <Input
                placeholder="XCLOUD, XC, HD..."
                value={formData.vplay_key_message || ''}
                onChange={(e) => setFormData({ ...formData, vplay_key_message: e.target.value.toUpperCase() })}
                className="font-mono uppercase"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Mensagem Personalizada da Cobrança (opcional)</Label>
            <Textarea
              placeholder="Mensagem adicional que aparecerá no final da cobrança..."
              value={formData.custom_message || ''}
              onChange={(e) => setFormData({ ...formData, custom_message: e.target.value })}
              className="min-h-[60px]"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        size="lg"
        onClick={() => saveMutation.mutate(formData)}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Salvar Todas as Configurações
      </Button>
    </div>
  );
}
