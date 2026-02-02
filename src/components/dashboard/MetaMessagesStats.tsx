import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, DollarSign, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { startOfMonth, format } from 'date-fns';

// Preços aproximados da Meta Cloud API (Brasil - BRL)
const META_PRICES = {
  utility: 0.0380, // Mensagens utilitárias (cobranças, confirmações)
  marketing: 0.0625, // Mensagens de marketing
  authentication: 0.0315, // Mensagens de autenticação
  service: 0.0000, // Conversas de serviço (24h window) - gratuito
};

interface MessageStats {
  utility: number;
  marketing: number;
  total: number;
  utilityCost: number;
  marketingCost: number;
  totalCost: number;
}

export default function MetaMessagesStats() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState<MessageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaConnected, setMetaConnected] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      try {
        // Verificar se usuário tem Meta conectado
        const { data: settings } = await supabase
          .from('zap_responder_settings')
          .select('api_type, meta_access_token')
          .eq('user_id', user.id)
          .maybeSingle();

        const hasMeta = settings?.api_type === 'meta_cloud' && !!settings?.meta_access_token;
        setMetaConnected(hasMeta);

        if (!hasMeta) {
          setLoading(false);
          return;
        }

        const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');

        // Buscar mensagens de cobrança (utility) do mês
        let utilityCount = 0;
        if (isAdmin) {
          const { count } = await supabase
            .from('billing_logs')
            .select('*', { count: 'exact', head: true })
            .gte('sent_at', monthStart);
          utilityCount = count || 0;
        }

        // Buscar mensagens de broadcast (marketing) do mês
        let marketingCount = 0;
        if (isAdmin) {
          const { count } = await supabase
            .from('broadcast_logs')
            .select('*', { count: 'exact', head: true })
            .eq('last_status', 'sent')
            .gte('last_sent_at', monthStart);
          marketingCount = count || 0;
        }

        const utilityCost = utilityCount * META_PRICES.utility;
        const marketingCost = marketingCount * META_PRICES.marketing;

        setStats({
          utility: utilityCount,
          marketing: marketingCount,
          total: utilityCount + marketingCount,
          utilityCost,
          marketingCost,
          totalCost: utilityCost + marketingCost,
        });
      } catch (error) {
        console.error('Error fetching Meta message stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user, isAdmin]);

  // Não mostrar se não tem Meta conectado
  if (!metaConnected && !loading) {
    return null;
  }

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) return null;

  return (
    <Card className="border-border/50 bg-gradient-to-br from-card via-card to-card/95">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <MessageSquare className="h-5 w-5 text-primary" />
          Mensagens Meta (Mês Atual)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Total Enviadas</span>
          </div>
          <div className="text-right">
            <span className="text-xl font-bold text-foreground">{stats.total}</span>
            <span className="text-xs text-muted-foreground ml-2">
              R$ {stats.totalCost.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Utility Messages */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                  Utilitário
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Cobranças</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-foreground">{stats.utility}</p>
              <p className="text-xs text-emerald-500 font-medium">
                R$ {stats.utilityCost.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Marketing Messages */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">
                  Marketing
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Disparos</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-foreground">{stats.marketing}</p>
              <p className="text-xs text-amber-500 font-medium">
                R$ {stats.marketingCost.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Price Info */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">
            Preços estimados: Utilitário R${META_PRICES.utility.toFixed(4)}/msg • Marketing R${META_PRICES.marketing.toFixed(4)}/msg
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
