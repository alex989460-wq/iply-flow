import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  UserPlus, 
  CreditCard, 
  MessageSquare, 
  Send,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: 'payment' | 'customer' | 'billing' | 'broadcast';
  title: string;
  description: string;
  timestamp: Date;
  icon: typeof Activity;
  color: string;
}

export default function ActivityFeed() {
  const { user, isAdmin } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }

    const fetchActivities = async () => {
      const results: ActivityItem[] = [];
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Fetch recent payments
      const { data: payments } = await supabase
        .from('payments')
        .select('id, amount, payment_date, customer:customers(name)')
        .gte('payment_date', threeDaysAgo.toISOString())
        .order('payment_date', { ascending: false })
        .limit(5);

      if (payments) {
        payments.forEach((p: any) => {
          results.push({
            id: `payment-${p.id}`,
            type: 'payment',
            title: 'Pagamento recebido',
            description: `${p.customer?.name || 'Cliente'} - R$ ${p.amount.toFixed(2)}`,
            timestamp: new Date(p.payment_date),
            icon: CreditCard,
            color: 'text-emerald-500 bg-emerald-500/10',
          });
        });
      }

      // Fetch recent customers
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, created_at')
        .gte('created_at', threeDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      if (customers) {
        customers.forEach((c) => {
          results.push({
            id: `customer-${c.id}`,
            type: 'customer',
            title: 'Novo cliente',
            description: c.name,
            timestamp: new Date(c.created_at),
            icon: UserPlus,
            color: 'text-blue-500 bg-blue-500/10',
          });
        });
      }

      // Fetch recent billing logs
      const { data: billings } = await supabase
        .from('billing_logs')
        .select('id, billing_type, sent_at, customer:customers(name)')
        .gte('sent_at', threeDaysAgo.toISOString())
        .order('sent_at', { ascending: false })
        .limit(5);

      if (billings) {
        billings.forEach((b: any) => {
          results.push({
            id: `billing-${b.id}`,
            type: 'billing',
            title: 'Cobrança enviada',
            description: `${b.customer?.name || 'Cliente'} (${b.billing_type})`,
            timestamp: new Date(b.sent_at),
            icon: MessageSquare,
            color: 'text-amber-500 bg-amber-500/10',
          });
        });
      }

      // Fetch recent broadcasts
      const { data: broadcasts } = await supabase
        .from('broadcast_logs')
        .select('id, template_name, last_sent_at, customer:customers(name)')
        .not('last_sent_at', 'is', null)
        .gte('last_sent_at', threeDaysAgo.toISOString())
        .order('last_sent_at', { ascending: false })
        .limit(5);

      if (broadcasts) {
        broadcasts.forEach((b: any) => {
          results.push({
            id: `broadcast-${b.id}`,
            type: 'broadcast',
            title: 'Disparo enviado',
            description: `${b.customer?.name || 'Cliente'}`,
            timestamp: new Date(b.last_sent_at),
            icon: Send,
            color: 'text-purple-500 bg-purple-500/10',
          });
        });
      }

      // Sort by timestamp descending
      results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setActivities(results.slice(0, 10));
      setLoading(false);
    };

    fetchActivities();
  }, [user, isAdmin]);

  if (!isAdmin) return null;

  return (
    <Card className="h-full border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          Atividades Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px] px-4 pb-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted rounded w-1/3" />
                    <div className="h-2 bg-muted rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Clock className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Nenhuma atividade recente</p>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.map((activity, index) => {
                const Icon = activity.icon;
                return (
                  <div
                    key={activity.id}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-lg transition-all duration-300",
                      "hover:bg-muted/50 hover:scale-[1.02]",
                      "animate-fade-in"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className={cn("p-2 rounded-lg flex-shrink-0", activity.color)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {activity.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {activity.description}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(activity.timestamp, { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
