import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Star, ExternalLink, Plus, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import EmbeddedSignupButton from '@/components/crm/EmbeddedSignupButton';
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
        c.wa_id, c.waId, c.from, c.phone_e164,
        c?.profile?.phone, c?.business?.phone_number,
      );
      const phone = rawPhone && rawPhone.replace(/\D/g, '').length <= 15 && rawPhone !== phoneId ? rawPhone : '';
      return {
        id: String(c.id || phoneId || `wa-${i}`),
        name: pick(c.name, c.title, c.verified_name),
        verified_name: pick(c.verified_name, c.business_name, c.name),
        display_phone_number: phone,
        phone_number: phone,
        phone_number_id: phoneId,
        quality_rating: pick(c.quality_rating, c.qualityRating),
        avatar_url: pick(c.avatar_url, c.profile_pic_url, c.profile_picture_url, c.picture),
        primary: !!(c.primary || c.is_primary || c.id === 'primary'),
        is_active: Boolean(c.is_active ?? c.active ?? c.connected ?? c.primary),
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
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'list-channels', data: { apiKey: key } },
      });
      if (error) throw error;
      const body = data?.results?.channels?.body;
      if (data?.results?.channels?.ok && body) setChannels(normalize(body));
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
            <h3 className="text-base font-semibold">Canais oficiais (API Oficial)</h3>
            <p className="text-xs text-muted-foreground">WhatsApp Cloud sincronizados com seu CRM Oficial.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EmbeddedSignupButton apiKey={apiKey} onCreated={() => load(apiKey)} />
          <Button variant="outline" size="sm" onClick={() => load(apiKey)} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/crm-oficial-channels"><ExternalLink className="w-4 h-4 mr-1" /> Avançado</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-5 space-y-4 hover:border-emerald-500/40 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  {ch.avatar_url ? (
                    <img src={ch.avatar_url} alt={ch.verified_name || ch.name || 'WhatsApp'} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500/30 to-emerald-600/40 flex items-center justify-center text-emerald-300 font-bold text-lg">
                      {(ch.verified_name || ch.name || 'W').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
                    <Zap className="w-2 h-2 text-white" />
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
                  <p className="text-xs text-emerald-400 font-mono truncate">{ch.display_phone_number || ch.phone_number || '—'}</p>
                </div>
              </div>
              <span className={cn(
                'text-xs font-medium flex items-center gap-1.5 shrink-0',
                ch.is_active ? 'text-emerald-400' : 'text-muted-foreground'
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', ch.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground')} />
                {ch.is_active ? 'Conectado' : 'Inativo'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
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
            </div>
          </div>
        ))}

        <Link
          to="/crm-oficial-channels"
          className="rounded-2xl border-2 border-dashed border-border/60 bg-card/20 p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/5 transition min-h-[180px]"
        >
          <Plus className="w-8 h-8" />
          <span className="font-medium">Adicionar novo canal</span>
        </Link>
      </div>
    </div>
  );
}
