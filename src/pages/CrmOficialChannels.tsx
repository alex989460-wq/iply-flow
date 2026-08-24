import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Loader2, Plus, RefreshCw, Star, Zap, Trash2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import AddChannelEmbedDialog from '@/components/crm/AddChannelEmbedDialog';
import { ProviderBadge } from '@/components/ui/provider-badge';
import { MetaLogo } from '@/components/ui/meta-logo';
import logoSg from '@/assets/logo-sg.png';
import whatsappLogo from '@/assets/whatsapp-logo.png.asset.json';


interface WhatsAppChannel {
  id: string;
  kind: 'whatsapp_cloud' | 'whatsapp_evolution';
  name?: string;
  phone_number?: string;
  display_phone_number?: string;
  verified_name?: string;
  phone_number_id?: string;
  waba_id?: string;
  quality_rating?: string;
  is_active?: boolean;
  primary?: boolean;
  is_primary?: boolean;
  avatar_url?: string | null;
  evolution_status?: string;
  instance_name?: string;
}
interface WebchatChannel {
  id: string;
  kind: 'webchat';
  widget_key?: string;
  title?: string;
  enabled?: boolean;
}


function qualityClass(q?: string) {
  const v = (q || '').toUpperCase();
  if (v === 'GREEN') return 'text-emerald-400';
  if (v === 'YELLOW') return 'text-amber-400';
  if (v === 'RED') return 'text-red-400';
  return 'text-muted-foreground';
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeChannelLists(body: any) {
  const fromChannels = Array.isArray(body) ? body : Array.isArray(body?.channels) ? body.channels : [];
  const whats = fromChannels.length
    ? fromChannels.filter((c: any) => String(c.kind || c.type || 'whatsapp_cloud').toLowerCase().includes('whatsapp') || c.primary || c.phone_number_id)
    : Array.isArray(body?.whatsapp)
      ? body.whatsapp
      : body?.whatsapp
        ? [body.whatsapp]
        : [];
  const webRaw = fromChannels.length
    ? fromChannels.filter((c: any) => String(c.kind || c.type || '').toLowerCase().includes('webchat') || c.widget_key)
    : Array.isArray(body?.webchat)
      ? body.webchat
      : body?.webchat
        ? [body.webchat]
        : [];
  const whatsapp = whats.map((c: any, index: number) => {
    const rawKind = String(c.kind || c.type || 'whatsapp_cloud').toLowerCase();
    const phoneId = pickString(c.phone_number_id, c.phoneNumberId);
    // Ter Phone Number ID = canal oficial da Meta, mesmo que venha com outros campos.
    const isEvolution = !phoneId && (rawKind.includes('evolution') || rawKind.includes('baileys') || !!c.instance_name || !!c.evolution_status);

    const rawPhone = pickString(
      c.display_phone_number, c.displayPhoneNumber, c.phone_display,
      c.phone_number, c.phoneNumber, c.phone, c.number, c.msisdn, c.wa_id,
      c.display_number, c.phone_number_clean,
      c?.verified_number, c?.official_number
    );
    const phone = rawPhone && rawPhone.replace(/\D/g, '').length <= 15
      ? (rawPhone.startsWith('+') ? rawPhone : `+${rawPhone.replace(/\D/g, '')}`)
      : '';
    const evolutionStatus = pickString(c.evolution_status, c.status, c.state);
    return {
      ...c,
      id: String(c.id || (c.primary ? 'primary' : '') || phoneId || `whatsapp-${index}`),
      kind: (isEvolution ? 'whatsapp_evolution' : 'whatsapp_cloud') as WhatsAppChannel['kind'],
      name: pickString(c.name, c.title, c.verified_name, c.display_name),
      verified_name: pickString(c.verified_name, c.verifiedName, c.business_name, c.name),
      display_phone_number: phone,
      phone_number: phone,
      phone_number_id: isEvolution ? '' : phoneId,
      instance_name: pickString(c.instance_name, c.instance, c.instanceName, c.evolution_instance_name, c.evolutionInstanceName),
      evolution_status: evolutionStatus,
      avatar_url: pickString(c.avatar_url, c.profile_pic_url, c.profile_picture_url, c.picture),
      primary: !!(c.primary || c.is_primary || c.id === 'primary'),
      is_active: isEvolution
        ? evolutionStatus === 'open' || Boolean(c.is_active ?? c.connected)
        : Boolean(c.is_active ?? c.active ?? c.connected ?? c.primary),
    };
  }) as WhatsAppChannel[];

  return { whatsapp: whatsapp.sort((a, b) => Number(!!b.primary || !!b.is_primary) - Number(!!a.primary || !!a.is_primary)), webchat: webRaw[0] || null };
}

export default function CrmOficialChannels() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [whatsapp, setWhatsapp] = useState<WhatsAppChannel[]>([]);
  const [webchat, setWebchat] = useState<WebchatChannel | null>(null);


  const loadChannels = useCallback(async (key: string) => {
    if (!key) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey: key } },
      });
      if (error) throw error;
      const body = data?.results?.channels?.body;
      if (data?.results?.channels?.ok && body) {
        const normalized = normalizeChannelLists(body);
        setWhatsapp(normalized.whatsapp);
        setWebchat(normalized.webchat);
      } else {
        toast({
          title: 'Não foi possível listar canais',
          description: `Status ${data?.results?.channels?.status ?? '?'}`,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('api_key, enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      const key = data?.api_key ?? '';
      setApiKey(key);
      setEnabled(!!data?.enabled);
      setLoading(false);
      if (key) loadChannels(key);
    })();
  }, [user, loadChannels]);




  const setPrimary = async (ch: WhatsAppChannel) => {
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'set-primary-channel', data: { apiKey, channel_id: ch.id, phone_number_id: ch.phone_number_id } },
      });
      if (error) throw error;
      const ok = !!data?.results?.channel?.ok;
      toast({
        title: ok ? 'Canal principal atualizado' : 'Não foi possível definir como principal',
        description: ok ? `${ch.verified_name || ch.name} agora é o número principal.` : `Status ${data?.results?.channel?.status ?? '?'}`,
        variant: ok ? 'default' : 'destructive',
      });
      if (ok) loadChannels(apiKey);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const deleteChannel = async (ch: WhatsAppChannel) => {
    if (!confirm(`Remover o canal "${ch.verified_name || ch.name}"?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'delete-channel', data: { apiKey, channel_id: ch.id } },
      });
      if (error) throw error;
      const ok = !!data?.results?.channel?.ok;
      toast({
        title: ok ? 'Canal removido' : 'Falha ao remover',
        variant: ok ? 'default' : 'destructive',
      });
      if (ok) loadChannels(apiKey);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-emerald-500" />
              Canais
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie seus canais WhatsApp Cloud e Webchat sincronizados com o CRM Oficial.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AddChannelEmbedDialog apiKey={apiKey} onCreated={() => loadChannels(apiKey)} />
            <Button variant="outline" size="sm" onClick={() => loadChannels(apiKey)} disabled={!apiKey || refreshing}>
              {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Atualizar
            </Button>
          </div>

        </div>

        {!apiKey && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Configure sua chave de API em <strong>Configurações → CRM Oficial</strong> antes de gerenciar canais.
            </AlertDescription>
          </Alert>
        )}

        {apiKey && !enabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A integração está desativada. As automações não dispararão até você ativá-la em Configurações.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {whatsapp.map((ch) => {
            const isPrimary = !!(ch.is_primary || ch.primary);
            const isOfficial = ch.kind !== 'whatsapp_evolution';
            const phone = ch.display_phone_number || ch.phone_number;
            return (
              <div
                key={ch.id}
                className={cn(
                  'group relative overflow-hidden rounded-3xl border bg-card/60 backdrop-blur-xl transition-all hover:-translate-y-1',
                  isOfficial ? 'hover:shadow-2xl hover:shadow-blue-500/20' : 'hover:shadow-2xl hover:shadow-emerald-500/20',
                  isPrimary
                    ? 'ring-2 ring-amber-500/50 border-amber-500/40'
                    : isOfficial ? 'border-blue-500/20' : 'border-emerald-500/20',
                )}
              >
                <div
                  className={cn(
                    'absolute inset-x-0 top-0 h-1',
                    isOfficial ? 'bg-gradient-to-r from-blue-500 to-primary' : 'bg-gradient-to-r from-emerald-500 to-teal-400',
                  )}
                />

                {isPrimary && (
                  <div className="absolute top-3 right-3 z-10 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg">
                    <Star className="w-3 h-3 fill-white" /> PRINCIPAL
                  </div>
                )}

                {/* Cabeçalho visual */}
                <div className="relative w-full h-52 overflow-hidden flex items-center justify-center bg-gradient-to-br from-muted/60 to-background">
                  {ch.avatar_url ? (
                    <>
                      {/* Blurred backdrop absorbs the low resolution of WhatsApp profile pics */}
                      <img
                        src={ch.avatar_url}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-50"
                      />
                      <div className={cn(
                        'absolute inset-0',
                        isOfficial ? 'bg-gradient-to-br from-blue-500/20 to-primary/10' : 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10',
                      )} />
                      {/* Crisp avatar rendered at (close to) its native resolution */}
                      <img
                        src={ch.avatar_url}
                        alt={ch.verified_name || ch.name || 'Canal WhatsApp'}
                        loading="lazy"
                        decoding="async"
                        className="relative w-24 h-24 rounded-full object-cover ring-4 ring-background/70 shadow-xl transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </>
                  ) : (
                    <div className={cn(
                      'absolute inset-0 flex items-center justify-center',
                      isOfficial ? 'bg-gradient-to-br from-blue-500/10 to-primary/10' : 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10',
                    )}>
                      <img src={logoSg} className="w-28 h-28 object-contain opacity-70" alt="Super Gestor" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/90 to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-background/80 backdrop-blur-md rounded-full px-2.5 py-1 border border-border/60">
                    {isOfficial ? <MetaLogo className="w-4 h-4" /> : <img src={whatsappLogo.url} alt="WhatsApp" className="w-4 h-4 object-contain" />}
                    <span className="text-[10px] font-semibold">
                      {isOfficial ? 'API Oficial (Meta)' : 'Não oficial (QR Code)'}
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <div className="font-bold text-xl leading-tight truncate">
                      {ch.verified_name || ch.name || (isOfficial ? 'WhatsApp Cloud' : 'WhatsApp QR')}
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {isOfficial ? (
                        <ProviderBadge provider="meta" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <img src={whatsappLogo.url} alt="WhatsApp" className="w-3.5 h-3.5 object-contain" /> WhatsApp não oficial
                        </span>
                      )}
                      <span className={cn(
                        'text-xs font-medium flex items-center gap-1.5',
                        ch.is_active ? 'text-emerald-400' : 'text-muted-foreground',
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', ch.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground')} />
                        {ch.is_active ? 'Conectado' : isOfficial ? 'Inativo' : (ch.evolution_status || 'Aguardando conexão')}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Número</p>
                      <p className="font-mono text-xs truncate">
                        {phone || (isOfficial ? 'Confirmando número...' : 'Aguardando leitura do QR')}
                      </p>

                    </div>
                    {isOfficial ? (
                      <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Qualidade Meta</p>
                        <p className={cn('font-bold text-xs', qualityClass(ch.quality_rating))}>
                          {(ch.quality_rating || 'SEM DADOS').toUpperCase()}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Instância</p>
                        <p className="font-mono text-[11px] truncate">{ch.instance_name || '—'}</p>
                      </div>
                    )}
                    {isOfficial && (
                      <div className="col-span-2 rounded-xl border border-border/40 bg-background/50 p-3">
                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Phone Number ID</p>
                        <p className="font-mono text-[11px] truncate">{ch.phone_number_id || '—'}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {!isPrimary && isOfficial && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                        onClick={() => setPrimary(ch)}
                      >
                        <Star className="w-3.5 h-3.5" />
                        Definir principal
                      </Button>
                    )}
                    {!isPrimary && !isOfficial && (
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled>
                        <img src={whatsappLogo.url} alt="WhatsApp" className="w-4 h-4 object-contain" />
                        Canal não oficial
                      </Button>
                    )}
                    {isPrimary && (
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Em uso
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => deleteChannel(ch)}
                      title="Remover canal"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}


          {/* Add new channel tile */}
          <AddChannelEmbedDialog
            apiKey={apiKey}
            onCreated={() => loadChannels(apiKey)}
            trigger={
              <button
                type="button"
                disabled={!apiKey}
                className="rounded-2xl border-2 border-dashed border-border/60 bg-card/20 p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-blue-500/50 hover:text-blue-400 hover:bg-blue-500/5 transition min-h-[280px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-8 h-8" />
                <span className="font-medium">Adicionar novo canal</span>
              </button>
            }
          />
        </div>



      </div>
    </DashboardLayout>
  );
}
