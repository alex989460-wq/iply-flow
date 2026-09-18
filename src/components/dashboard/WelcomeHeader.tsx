import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Sunset, CalendarDays, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export default function WelcomeHeader() {
  const { user } = useAuth();
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const fetchProfile = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .maybeSingle();
        setProfileName(data?.full_name || null);
      };
      fetchProfile();
    }
  }, [user]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { text: 'Bom dia', icon: Sun, color: 'text-amber-500' };
    if (hour >= 12 && hour < 18) return { text: 'Boa tarde', icon: Sunset, color: 'text-orange-500' };
    return { text: 'Boa noite', icon: Moon, color: 'text-indigo-400' };
  };

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;
  const displayName = profileName || user?.email?.split('@')[0] || 'Usuário';

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card px-5 py-6 shadow-sm animate-fade-in sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-gradient-to-l from-primary/10 to-transparent" />
      <div className="pointer-events-none absolute -right-14 -top-24 h-52 w-52 rounded-full border-[32px] border-primary/10" />
      <div className="relative z-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className={cn("grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-background/80 shadow-sm", greeting.color)}>
            <GreetingIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <Sparkles className={cn("h-3.5 w-3.5", greeting.color)} />
              <span className={cn("text-[11px] font-bold uppercase tracking-[0.18em]", greeting.color)}>
                {greeting.text}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Olá, {displayName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Acompanhe o desempenho da sua operação em um só lugar.</p>
          </div>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="capitalize">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
        </div>
      </div>
    </div>
  );
}
