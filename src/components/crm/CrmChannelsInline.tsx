import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ShieldCheck, Star, Wifi, WifiOff, Lock, Server, Sparkles, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import EmbeddedSignupButton from '@/components/crm/EmbeddedSignupButton';
import logoSg from '@/assets/logo-sg.png';

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
      // Se o "número" veio igual ao phone_number_id (15-17 dígitos), ignora — não é telefone real
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
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
            <Sparkles className="w-3.5 h-3.5" /> CANAIS OFICIAIS WHATSAPP BUSINESS
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Conectados via API oficial Meta — usados para templates aprovados e cobranças automáticas.</p>
        </div>
        <div className="flex gap-2">
          <EmbeddedSignupButton apiKey={apiKey} onCreated={() => load(apiKey)} />
          <Button variant="outline" size="sm" onClick={() => load(apiKey)} disabled={refreshing} className="bg-background/60 backdrop-blur">
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/crm-oficial-channels"><ExternalLink className="w-4 h-4 mr-1" /> Avançado</Link>
          </Button>
        </div>
      </div>

      {channels.length === 0 ? (
        <Card className="border-dashed border-blue-500/30 bg-background/40">
          <CardContent className="py-6 text-center text-xs text-muted-foreground">
            Nenhum canal oficial conectado. Use <b>Conectar com Facebook</b> acima para vincular um número.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {channels.map((ch) => {
            const connected = !!ch.is_active;
            const Icon = connected ? Wifi : WifiOff;
            return (
              <Card
                key={ch.id}
                className={`relative overflow-hidden border bg-background/55 backdrop-blur-xl transition-all hover:shadow-2xl hover:shadow-blue-500/20 hover:-translate-y-1 ${
                  ch.primary ? 'ring-2 ring-blue-500/50 border-blue-500/40' : 'border-white/10'
                }`}
              >
                {ch.primary && (
                  <div className="absolute top-2 right-2 z-10 bg-blue-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Star className="w-3 h-3 fill-white" /> PRINCIPAL
                  </div>
                )}
                <div className="relative w-full aspect-square overflow-hidden flex items-center justify-center bg-gradient-to-br from-blue-500/10 to-emerald-500/10">
                  {ch.avatar_url ? (
                    <img src={ch.avatar_url} alt={ch.verified_name || 'WhatsApp'} className="w-40 h-40 object-cover rounded-full" />
                  ) : (
                    <img src={logoSg} className="w-40 h-40 object-contain opacity-80" alt="WA Oficial" />
                  )}
                  <div className="absolute bottom-2 left-2 bg-blue-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                    <ShieldCheck className="w-3 h-3 inline mr-1" /> OFICIAL META
                  </div>
                </div>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <div className="font-bold text-lg leading-tight truncate">{ch.verified_name || ch.name || 'WhatsApp Oficial'}</div>
                    <div className="flex items-center justify-between mt-2">
                      <Badge className={`gap-1 text-[10px] border-0 ${connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                        <Icon className="w-3 h-3" /> {connected ? 'Conectado' : 'Inativo'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {ch.display_phone_number || (ch.phone_number ? `+${ch.phone_number}` : '—')}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      <span className="truncate font-mono">{ch.phone_number_id || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Server className="w-3 h-3 shrink-0" />
                      <span className="truncate">Qualidade: {(ch.quality_rating || '—').toUpperCase()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
