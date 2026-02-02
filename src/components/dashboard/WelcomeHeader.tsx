import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { Sparkles, Sun, Moon, Sunset } from 'lucide-react';
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6 animate-fade-in">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GreetingIcon className={cn("w-5 h-5 animate-pulse-slow", greeting.color)} />
            <span className={cn("text-sm font-medium", greeting.color)}>
              {greeting.text}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">
            Olá, <span className="text-primary">{displayName}</span>! 
            <Sparkles className="inline-block w-6 h-6 ml-2 text-amber-400 animate-pulse" />
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Confira as novidades do seu sistema IPTV
          </p>
        </div>
        
        {/* Animated decorative icon */}
        <div className="hidden sm:flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
          <GreetingIcon className={cn("w-10 h-10", greeting.color)} />
        </div>
      </div>
    </div>
  );
}
