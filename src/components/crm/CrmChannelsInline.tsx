import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Star, Wifi, WifiOff, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import EmbeddedSignupButton from '@/components/crm/EmbeddedSignupButton';
import { MetaLogo } from '@/components/ui/meta-logo';


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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0064E0] to-[#19AFFF] flex items-center justify-center shadow-md shadow-blue-500/20">
            <MetaLogo className="w-5 h-5 [&_path]:!fill-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">WhatsApp Business API</div>
            <p className="text-[11px] text-muted-foreground">Canais oficiais conectados via Meta</p>
          </div>
        </div>
        <div className="flex gap-2">
          <EmbeddedSignupButton apiKey={apiKey} onCreated={() => load(apiKey)} />
          <Button variant="outline" size="sm" onClick={() => load(apiKey)} disabled={refreshing} className="rounded-full">
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Atualizar
          </Button>
          <Button asChild size="sm" variant="ghost" className="rounded-full">
            <Link to="/crm-oficial-channels"><ExternalLink className="w-4 h-4 mr-1" /> Avançado</Link>
          </Button>
        </div>
      </div>

      {channels.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-muted/20">
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            Nenhum canal oficial conectado. Use <b>Conectar com Facebook</b> para vincular um número.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {channels.map((ch) => {
            const connected = !!ch.is_active;
            const Icon = connected ? Wifi : WifiOff;
            return (
              <Card
                key={ch.id}
                className={`relative overflow-hidden border bg-card transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                  ch.primary ? 'ring-1 ring-primary/40 border-primary/30' : 'border-border/60'
                }`}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="relative shrink-0">
                    {ch.avatar_url ? (
                      <img src={ch.avatar_url} alt={ch.verified_name || 'WhatsApp'} className="w-14 h-14 rounded-full object-cover ring-2 ring-background" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0064E0]/15 to-[#19AFFF]/15 flex items-center justify-center">
                        <MetaLogo className="w-7 h-7" />
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5 border border-border/60">
                      <MetaLogo className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-semibold truncate">{ch.verified_name || ch.name || 'WhatsApp Oficial'}</span>
                      {ch.primary && (
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {ch.display_phone_number || (ch.phone_number ? `+${ch.phone_number}` : '—')}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge className={`gap-1 text-[10px] border-0 px-1.5 py-0 h-4 ${connected ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'}`}>
                        <Icon className="w-2.5 h-2.5" /> {connected ? 'Conectado' : 'Inativo'}
                      </Badge>
                      {ch.quality_rating && (
                        <span className="text-[10px] text-muted-foreground uppercase">{ch.quality_rating}</span>
                      )}
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

