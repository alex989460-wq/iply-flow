import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Sunset } from 'lucide-react';
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
    <div className="flex items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-card/30 border border-primary/20 shadow-xl shadow-primary/5 animate-fade-in relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl transition-transform duration-700 group-hover:scale-150" />
      <div className="flex items-center gap-4 relative z-10">
        <div className={cn("p-3 rounded-xl bg-background/80 backdrop-blur-md shadow-inner border border-white/10", greeting.color)}>
          <GreetingIcon className="w-6 h-6 animate-pulse-slow" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-xs font-bold uppercase tracking-widest opacity-80", greeting.color)}>
              {greeting.text}
            </span>
            <div className={cn("h-px w-8", greeting.color.replace('text', 'bg'), "opacity-30")} />
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-foreground tracking-tight leading-none">
            Olá, <span className="text-primary drop-shadow-sm">{displayName}</span>! ✨
          </h1>
        </div>
      </div>
    </div>
  );
}
