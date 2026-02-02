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
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg bg-background/50", greeting.color)}>
          <GreetingIcon className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", greeting.color)}>
              {greeting.text}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">
            Olá, <span className="text-primary">{displayName}</span>! ✨
          </h1>
        </div>
      </div>
    </div>
  );
}
