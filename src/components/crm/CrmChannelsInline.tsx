import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Star, ExternalLink, Plus, Zap, Settings } from 'lucide-react';
import { MetaLogo } from '@/components/ui/meta-logo';
import whatsappLogo from '@/assets/whatsapp-logo.png.asset.json';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import AddChannelEmbedDialog from '@/components/crm/AddChannelEmbedDialog';
import { cn } from '@/lib/utils';

interface WAChannel {
  id: string;
  name?: string;
  verified_name?: string;
  display_phone_number?: string;
  phone_number?: string;
  phone_number_id?: string;
  quality_rating?: string;
  is_active?: boolean;
  primary?: boolean;
  is_primary?: boolean;
  avatar_url?: string | null;
  official?: boolean;
  instance_name?: string;
  evolution_status?: string;
}

function pick(...values: unknown[]) {
  for (const v of values) if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
}

function qualityClass(q?: string) {
  const v = (q || '').toUpperCase();
  if (v === 'GREEN') return 'text-emerald-400';
  if (v === 'YELLOW') return 'text-amber-400';
  if (v === 'RED') return 'text-red-400';
  return 'text-muted-foreground';
}

function normalize(body: any): WAChannel[] {
  const list = Array.isArray(body) ? body : Array.isArray(body?.channels) ? body.channels : Array.isArray(body?.whatsapp) ? body.whatsapp : body?.whatsapp ? [body.whatsapp] : [];
  return list
    .filter((c: any) => String(c.kind || c.type || 'whatsapp_cloud').toLowerCase().includes('whatsapp') || c.primary || c.phone_number_id)
    .map((c: any, i: number) => {
      const phoneId = pick(c.phone_number_id, c.phoneNumberId);
      const rawPhone = pick(
        c.display_phone_number, c.displayPhoneNumber, c.phone_display,
        c.phone_number, c.phoneNumber, c.phone, c.number, c.msisdn,
        c.wa_id, c.waId, c.from, c.phone_e164, c.display_number,
        c?.profile?.phone, c?.business?.phone_number, c?.phone_number_clean,
        c?.verified_number, c?.official_number
      );
      const phone = rawPhone && rawPhone.replace(/\D/g, '').length <= 15 ? rawPhone : '';
      const kind = String(c.kind || c.type || 'whatsapp_cloud').toLowerCase();
      // Ter Phone Number ID = canal oficial da Meta (nunca tratar como Evolution).
      const official = !!phoneId || !(kind.includes('evolution') || kind.includes('baileys') || !!c.evolution_instance_name || !!c.evolution_status);
      return {
        official,
        instance_name: pick(c.evolution_instance_name, c.instance_name, c.instance),
        evolution_status: pick(c.evolution_status, c.status),
        id: String(c.id || phoneId || `wa-${i}`),
        name: pick(c.name, c.title, c.verified_name),
        verified_name: pick(c.verified_name, c.business_name, c.name),
        display_phone_number: phone,
        phone_number: phone,
        phone_number_id: phoneId,
        quality_rating: pick(c.quality_rating, c.qualityRating),
        avatar_url: pick(c.avatar_url, c.profile_pic_url, c.profile_picture_url, c.picture),
        primary: !!(c.primary || c.is_primary || c.id === 'primary'),
        is_active: official
          ? Boolean(c.is_active ?? c.active ?? c.connected ?? c.primary)
          : pick(c.evolution_status) === 'open' || Boolean(c.is_active ?? c.connected),
      };
    })
    .sort((a: WAChannel, b: WAChannel) => Number(!!b.primary) - Number(!!a.primary));
}

export default function CrmChannelsInline() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [channels, setChannels] = useState<WAChannel[]>([]);

  const load = useCallback(async (key: string) => {
    if (!key) return;
    setRefreshing(true);
    try {
      const [crmRes, liveRes] = await Promise.all([
        supabase.functions.invoke('crm-oficial-sync', {
          body: { action: 'list-channels', data: { apiKey: key } },
        }),
        supabase.functions.invoke('evolution-send', {
          body: { action: 'list-instances' },
        }),
      ]);

      if (crmRes.error) throw crmRes.error;
      const body = crmRes.data?.results?.channels?.body;
      const crmChannels = crmRes.data?.results?.channels?.ok && body ? normalize(body) : [];

      // Só mostra instâncias não oficiais que realmente existem no servidor Evolution.
      const liveInstances: any[] = liveRes.data?.ok ? (liveRes.data.instances || []) : [];
      const localChannels: WAChannel[] = liveInstances.map((i: any) => ({
        official: false,
        id: `local-${i.id || i.name}`,
        instance_name: i.name,
        name: i.profile_name || i.name,
        verified_name: i.profile_name || i.name,
        display_phone_number: i.phone || '',
        phone_number: i.phone || '',
        avatar_url: i.profile_pic || null,
        is_active: true,
        evolution_status: i.state || 'close',
      }));

      const liveNames = new Set(liveInstances.map((i: any) => String(i.name || '').toLowerCase()));
      const seen = new Set(
        crmChannels
          .filter((c) => !c.official)
          .map((c) => (c.instance_name || c.name || '').toLowerCase()),
      );

      // Um número que já existe como canal OFICIAL (Meta) nunca pode aparecer
      // também como conexão não oficial (Evolution/QR).
      const onlyDigits = (v?: string | null) => String(v || '').replace(/\D/g, '');
      const officialPhones = new Set(
        crmChannels
          .filter((c) => c.official)
          .map((c) => onlyDigits(c.display_phone_number || c.phone_number))
          .filter((d) => d.length >= 10),
      );
      const isOfficialPhone = (v?: string | null) => {
        const d = onlyDigits(v);
        if (d.length < 10) return false;
        return [...officialPhones].some((p) => p === d || p.endsWith(d.slice(-10)) || d.endsWith(p.slice(-10)));
      };

      const merged = [
        // Mantém todos os canais do CRM (o CRM pode usar outro servidor Evolution).
        // Só descarta "fantasmas": não oficiais sem número e inexistentes no servidor local.
        ...crmChannels.filter((c) => {
          if (c.official) return true;
          if (isOfficialPhone(c.phone_number || c.display_phone_number)) return false;
          const hasPhone = !!(c.phone_number || c.display_phone_number);
          if (hasPhone) return true;
          return liveNames.has((c.instance_name || c.name || '').toLowerCase());
        }),
        ...localChannels.filter(
          (c) => !seen.has((c.instance_name || '').toLowerCase()) && !isOfficialPhone(c.phone_number),
        ),
      ];


      setChannels(merged);

      // Importa automaticamente as instâncias criadas pelo embed do CRM que ainda
      // não estão registradas neste sistema, para aparecerem em Conexões/Chat e
      // para o webhook passar a receber as mensagens.
      const toClaim = merged
        .filter((c) => !c.official)
        .map((c) => (c.instance_name || '').trim())
        .filter((n) => n && !liveNames.has(n.toLowerCase()));
      if (toClaim.length) {
        const claimed = await Promise.all(
          toClaim.map((n) =>
            supabase.functions
              .invoke('evolution-send', { body: { action: 'claim-instance', name: n } })
              .then((r) => !!r.data?.ok)
              .catch(() => false),
          ),
        );
        if (claimed.some(Boolean)) {
          toast({
            title: 'Conexão importada',
            description: 'Instância do CRM vinculada a este sistema. Atualize o chat para receber mensagens.',
          });
        }
      }


      if (!merged.length && key) {
        // Fallback: se não carregou nada mas tem chave, tenta uma sincronização forçada
        supabase.functions.invoke('crm-oficial-sync', {
          body: { action: 'repair-missing', data: { apiKey: key } },
        }).then(() => load(key));
      }
    } catch (e: any) {
      toast({ title: 'Erro ao listar canais oficiais', description: e.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('crm_oficial_settings')
        .select('api_key')
        .eq('user_id', user.id)
        .maybeSingle();
      const key = data?.api_key ?? '';
      setApiKey(key);
      setLoading(false);
      if (key) load(key);
    })();
  }, [user, load]);


  if (loading) return null;
  if (!apiKey) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-500" />
          <div>
            <h3 className="text-base font-semibold">Conexões WhatsApp</h3>
            <p className="text-xs text-muted-foreground">Canais oficiais (Meta) e não oficiais sincronizados com seu CRM.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AddChannelEmbedDialog apiKey={apiKey} onCreated={() => load(apiKey)} />
          <Button variant="outline" size="sm" onClick={() => load(apiKey)} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/crm-oficial-channels"><ExternalLink className="w-4 h-4 mr-1" /> Avançado</Link>
          </Button>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className={cn(
              'group relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-xl p-5 space-y-4 transition-all hover:-translate-y-0.5',
              ch.official
                ? 'border-blue-500/25 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10'
                : 'border-emerald-500/25 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/10',
              (ch.primary) && 'ring-1 ring-amber-500/40',
            )}
          >
            <div className={cn(
              'absolute inset-x-0 top-0 h-0.5',
              ch.official ? 'bg-gradient-to-r from-blue-500 to-primary' : 'bg-gradient-to-r from-emerald-500 to-teal-400',
            )} />

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  {ch.avatar_url ? (
                    <img src={ch.avatar_url} alt={ch.verified_name || ch.name || 'WhatsApp'} className="w-12 h-12 rounded-full object-cover ring-2 ring-border/60" />
                  ) : (
                    <div className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg',
                      ch.official ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300',
                    )}>
                      {(ch.verified_name || ch.name || 'W').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-background border border-border grid place-items-center overflow-hidden">
                    {ch.official
                      ? <MetaLogo className="w-3 h-3" />
                      : <img src={whatsappLogo.url} alt="WhatsApp" className="w-3.5 h-3.5 object-contain" />}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{ch.verified_name || ch.name || 'WhatsApp'}</h3>
                    {ch.primary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                        <Star className="w-2.5 h-2.5 fill-amber-400" /> Principal
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">{ch.display_phone_number || ch.phone_number || (ch.official ? 'Confirmando número...' : 'Número não informado')}</p>
                </div>
              </div>
              <span className={cn(
                'text-xs font-medium flex items-center gap-1.5 shrink-0',
                ch.is_active ? 'text-emerald-400' : 'text-muted-foreground'
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', ch.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground')} />
                {ch.is_active ? 'Conectado' : (ch.evolution_status || 'Inativo')}
              </span>
            </div>

            <span className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full border',
              ch.official
                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
            )}>
              {ch.official
                ? <><MetaLogo className="w-3.5 h-3.5" /> API Oficial (Meta)</>
                : <><img src={whatsappLogo.url} alt="WhatsApp" className="w-3.5 h-3.5 object-contain" /> WhatsApp não oficial</>}
            </span>

            <div className="grid grid-cols-2 gap-2">
              {ch.official ? (
                <>
                  <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone ID</p>
                    <p className="font-mono text-xs truncate">{ch.phone_number_id || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-background/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qualidade</p>
                    <p className={cn('font-bold text-sm', qualityClass(ch.quality_rating))}>
                      {(ch.quality_rating || '—').toUpperCase()}
                    </p>
                  </div>
                </>
              ) : (
                <div className="col-span-2 rounded-lg border border-border/40 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Instância</p>
                  <p className="font-mono text-xs truncate">{ch.instance_name || '—'}</p>
                </div>
              )}
            </div>

            {!ch.official && (
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to={`/evolution-instances?settings=${encodeURIComponent(ch.instance_name || ch.name || '')}`}>
                  <Settings className="w-4 h-4 mr-2" /> Funções / Configurações
                </Link>
              </Button>
            )}

          </div>
        ))}

        <AddChannelEmbedDialog
          apiKey={apiKey}
          onCreated={() => load(apiKey)}
          trigger={
            <button
              type="button"
              className="rounded-2xl border-2 border-dashed border-border/60 bg-card/20 p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/5 transition min-h-[180px]"
            >
              <Plus className="w-8 h-8" />
              <span className="font-medium">Adicionar novo canal</span>
            </button>
          }
        />

      </div>
    </div>
  );
}
