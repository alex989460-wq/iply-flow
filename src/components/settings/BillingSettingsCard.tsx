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
import { Save, Loader2, Upload, Trash2, ImageIcon, RefreshCw, Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
  meta_phone_number_id?: string | null;
  notification_phone: string | null;
  renewal_message_template: string | null;
  renewal_image_url: string | null;
  renewal_notification_target?: 'admin' | 'both' | null;
  use_evolution_billing?: boolean;
  evolution_instance?: string | null;
  evolution_msg_d_minus_1?: string | null;
  evolution_msg_d0?: string | null;
  evolution_msg_d_plus_1?: string | null;
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const notifStorageKey = user?.id ? `renewal_notifications_enabled_${user.id}` : '';
  const savedPhoneRef = useRef<string>('');

  // Fetch available templates directly from Meta (API Oficial via meta-templates edge function)
  const { data: metaTemplates = [], isLoading: loadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['meta-templates-list', user?.id],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('meta-templates', {
          body: { action: 'list', limit: 200 },
        });
        if (error) throw error;
        const list = (data?.data || [])
          .map((t: any) => ({
            name: t?.name ?? '',
            status: t?.status ?? '',
            language: t?.language ?? '',
          }))
          .filter((t: any) => !!t.name);
        const seen = new Set<string>();
        return list.filter((t: any) => (seen.has(t.name) ? false : (seen.add(t.name), true)));
      } catch (e) {
        console.error('Error fetching Meta templates:', e);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch Meta WhatsApp channels (multi-number support) so the reseller can pick
  // exactly which number sends the payment confirmation.
  const { data: metaChannels = [], isLoading: loadingChannels, refetch: refetchChannels } = useQuery({
    queryKey: ['meta-channels-list', user?.id],
    queryFn: async () => {
      try {
        const { data } = await supabase.functions.invoke('crm-oficial-sync', {
          body: { action: 'list-channels' },
        });
        const raw = data?.results?.channels?.body || data?.channels?.body || data?.results?.channels || data?.channels || [];
        const list = Array.isArray(raw) ? raw : (raw?.data || raw?.items || []);
        return (list || [])
          .map((c: any) => ({
            id: String(c?.id || ''),
            phone_number_id: String(c?.phone_number_id || ''),
            display_phone_number: String(c?.display_phone_number || c?.phone_number || c?.number || ''),
            verified_name: String(c?.verified_name || c?.name || c?.label || ''),
            is_active: c?.is_active !== false,
          }))
          .filter((c: any) => c.phone_number_id);
      } catch (e) {
        console.error('Error fetching Meta channels:', e);
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

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
    meta_phone_number_id: '',
    notification_phone: '',
    renewal_message_template: '',
    renewal_image_url: '',
    renewal_notification_target: 'both',
    use_evolution_billing: false,
    evolution_instance: '',
    evolution_msg_d_minus_1: '',
    evolution_msg_d0: '',
    evolution_msg_d_plus_1: '',
  });

  // Load Evolution instances for the picker
  const { data: evoInstances = [] } = useQuery({
    queryKey: ['evo-instances-billing', user?.id],
    queryFn: async () => {
      try {
        const { data } = await supabase.functions.invoke('evolution-send', {
          body: { action: 'list-instances' },
        });
        return (data?.instances || []) as Array<{ name: string; phone?: string; state?: string }>;
      } catch {
        return [];
      }
    },
    enabled: !!user?.id,
    staleTime: 60_000,
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
        meta_phone_number_id: (settings as any).meta_phone_number_id || '',
        notification_phone: (settings as any).notification_phone || '',
        renewal_message_template: (settings as any).renewal_message_template || '',
        renewal_image_url: (settings as any).renewal_image_url || '',
        renewal_notification_target: ((settings as any).renewal_notification_target as 'admin' | 'both') || 'both',
        use_evolution_billing: !!(settings as any).use_evolution_billing,
        evolution_instance: (settings as any).evolution_instance || '',
        evolution_msg_d_minus_1: (settings as any).evolution_msg_d_minus_1 || '',
        evolution_msg_d0: (settings as any).evolution_msg_d0 || '',
        evolution_msg_d_plus_1: (settings as any).evolution_msg_d_plus_1 || '',
      });
      const phone = (settings as any).notification_phone || '';
      savedPhoneRef.current = phone;
      const stored = notifStorageKey ? localStorage.getItem(notifStorageKey) : null;
      if (stored === null) {
        setNotificationsEnabled(!!phone);
      } else {
        setNotificationsEnabled(stored === '1');
      }
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
        meta_phone_number_id: data.meta_phone_number_id || null,
        notification_phone: notificationsEnabled ? (data.notification_phone || '') : '',
        renewal_message_template: data.renewal_message_template || null,
        renewal_image_url: data.renewal_image_url || '',
        renewal_notification_target: data.renewal_notification_target || 'both',
        use_evolution_billing: !!data.use_evolution_billing,
        evolution_instance: data.evolution_instance || null,
        evolution_msg_d_minus_1: data.evolution_msg_d_minus_1 || null,
        evolution_msg_d0: data.evolution_msg_d0 || null,
        evolution_msg_d_plus_1: data.evolution_msg_d_plus_1 || null,
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
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-lg">📞 Notificações e Mensagem de Renovação</CardTitle>
              <CardDescription>Configure o telefone que receberá confirmações e personalize a mensagem enviada ao cliente</CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-medium ${notificationsEnabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                {notificationsEnabled ? 'Ativado' : 'Desativado'}
              </span>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={(checked) => {
                  setNotificationsEnabled(checked);
                  if (notifStorageKey) localStorage.setItem(notifStorageKey, checked ? '1' : '0');
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className={`space-y-4 ${notificationsEnabled ? '' : 'opacity-50 pointer-events-none'}`}>

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
            <Label className="text-sm">Regra de envio da confirmação</Label>
            <Select
              value={formData.renewal_notification_target || 'both'}
              onValueChange={(v) => setFormData({ ...formData, renewal_notification_target: v as 'admin' | 'both' })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Somente para o telefone de notificações (admin)</SelectItem>
                <SelectItem value="both">Para o cliente e para o telefone de notificações</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Define para quem a mensagem de renovação será enviada após cada pagamento confirmado.
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
              Variáveis: {'{{nome}}'}, {'{{vencimento}}'}, {'{{hora}}'}, {'{{valor}}'}, {'{{usuario}}'}, {'{{plano}}'}, {'{{servidor}}'}, {'{{telas}}'}, {'{{telefone}}'}, {'{{obs}}'}, {'{{inicio}}'}, {'{{status}}'}. Deixe vazio para mensagem padrão.
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

      {/* WhatsApp Template (API Oficial) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">💬 Template WhatsApp (API Oficial)</CardTitle>
          <CardDescription>
            Template aprovado usado quando a cobrança é enviada pela API oficial do WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Nome do Template Aprovado</Label>
            <div className="flex gap-2">
              <Input
                placeholder="ex: pedido_aprovado"
                value={formData.meta_template_name || ''}
                onChange={(e) => setFormData({ ...formData, meta_template_name: e.target.value })}
                className="flex-1 font-mono"
                list="meta-templates-list"
              />
              <datalist id="meta-templates-list">
                {metaTemplates.map((t: any) => (
                  <option key={t.name} value={t.name}>{t.status}</option>
                ))}
              </datalist>
              <Select
                value=""
                onValueChange={(v) => setFormData({ ...formData, meta_template_name: v })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Escolher da lista" />
                </SelectTrigger>
                <SelectContent>
                  {metaTemplates.map((t: any) => (
                    <SelectItem key={t.name} value={t.name}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${t.status === 'APPROVED' ? 'bg-green-500' : t.status === 'PENDING' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                  {metaTemplates.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum template carregado</div>
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetchTemplates()}
                disabled={loadingTemplates}
                title="Recarregar templates"
              >
                {loadingTemplates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            {metaTemplates.length === 0 && !loadingTemplates && (
              <p className="text-xs text-muted-foreground">
                Nenhum template carregado. Conecte a API Oficial (Meta) para listar automaticamente, ou digite o nome do template manualmente.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: {'{{1}}'} Nome, {'{{2}}'} Usuário, {'{{3}}'} Servidor, {'{{4}}'} Vencimento.
            </p>
          </div>

          {/* Selector: which Meta phone number should send the confirmation */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm">Número do WhatsApp (API Oficial) que envia a confirmação</Label>
            <div className="flex gap-2">
              <Select
                value={formData.meta_phone_number_id || '__default__'}
                onValueChange={(v) => setFormData({ ...formData, meta_phone_number_id: v === '__default__' ? '' : v })}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Número padrão (mais recente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Número padrão (mais recente)</SelectItem>
                  {metaChannels.map((c: any) => (
                    <SelectItem key={c.phone_number_id} value={c.phone_number_id}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${c.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {c.display_phone_number || c.verified_name || c.phone_number_id}
                        {c.verified_name && c.display_phone_number ? ` — ${c.verified_name}` : ''}
                      </span>
                    </SelectItem>
                  ))}
                  {metaChannels.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum número carregado</div>
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetchChannels()}
                disabled={loadingChannels}
                title="Recarregar números"
              >
                {loadingChannels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecione qual número da API Oficial envia a mensagem de confirmação (evita usar o número de marketing por engano).
            </p>
          </div>

        </CardContent>
      </Card>

      {/* Evolution as billing channel (API Não-Oficial) */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Enviar Cobrança pela Evolution (API Não-Oficial)
              </CardTitle>
              <CardDescription>
                Quando ativo, as cobranças (D-1, D0, D+1) são enviadas como mensagem de texto comum pela instância da Evolution API (não-oficial, via QR Code) selecionada abaixo. A sua API Oficial do WhatsApp permanece configurada e salva, mas não é usada enquanto esta opção estiver ligada.
              </CardDescription>
            </div>
            <Switch
              checked={!!formData.use_evolution_billing}
              onCheckedChange={(v) => setFormData({ ...formData, use_evolution_billing: v })}
            />
          </div>
        </CardHeader>

        {formData.use_evolution_billing && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Instância da Evolution</Label>
              <Select
                value={formData.evolution_instance || ''}
                onValueChange={(v) => setFormData({ ...formData, evolution_instance: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a instância" />
                </SelectTrigger>
                <SelectContent>
                  {evoInstances.map((i: any) => (
                    <SelectItem key={i.name} value={i.name}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${i.state === 'open' ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {i.name} {i.phone ? `• ${i.phone}` : ''}
                      </span>
                    </SelectItem>
                  ))}
                  {evoInstances.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma instância encontrada</div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Deixe vazio para usar a instância ativa padrão.</p>
            </div>

            {[
              { key: 'evolution_msg_d_minus_1', label: 'Mensagem D-1 (vence amanhã)', ph: 'Olá {{nome}}, seu plano vence amanhã ({{vencimento}}). PIX: {{pix}}' },
              { key: 'evolution_msg_d0', label: 'Mensagem D0 (vence hoje)', ph: 'Olá {{nome}}, seu plano vence hoje ({{vencimento}}). PIX: {{pix}}' },
              { key: 'evolution_msg_d_plus_1', label: 'Mensagem D+1 (vencido)', ph: 'Olá {{nome}}, seu plano venceu em {{vencimento}}. PIX: {{pix}}' },
            ].map(({ key, label, ph }) => (
              <div key={key} className="space-y-2">
                <Label className="text-sm">{label}</Label>
                <Textarea
                  placeholder={ph}
                  value={(formData as any)[key] || ''}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                  className="min-h-[90px] font-mono text-sm"
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Variáveis: {'{{nome}}'}, {'{{vencimento}}'}, {'{{usuario}}'}, {'{{plano}}'}, {'{{valor}}'}, {'{{servidor}}'}, {'{{pix}}'}, {'{{telefone}}'}.
            </p>
          </CardContent>
        )}
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
