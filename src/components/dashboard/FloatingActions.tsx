import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  UserPlus, 
  Send, 
  CreditCard,
  X,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface ActionItem {
  id: string;
  label: string;
  icon: typeof Plus;
  color: string;
  href: string;
}

export default function FloatingActions() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  if (!isAdmin) return null;

  const actions: ActionItem[] = [
    {
      id: 'new-customer',
      label: 'Novo Cliente',
      icon: UserPlus,
      color: 'bg-blue-500 hover:bg-blue-600',
      href: '/customers?action=new',
    },
    {
      id: 'billing',
      label: 'Cobranças',
      icon: Send,
      color: 'bg-amber-500 hover:bg-amber-600',
      href: '/billing',
    },
    {
      id: 'payment',
      label: 'Pagamentos',
      icon: CreditCard,
      color: 'bg-emerald-500 hover:bg-emerald-600',
      href: '/payments',
    },
    {
      id: 'broadcast',
      label: 'Disparos',
      icon: MessageSquare,
      color: 'bg-purple-500 hover:bg-purple-600',
      href: '/mass-broadcast',
    },
  ];

  const handleAction = (href: string) => {
    setIsOpen(false);
    navigate(href);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Action buttons */}
      <div className={cn(
        "absolute bottom-16 right-0 flex flex-col gap-2 transition-all duration-300",
        isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        {actions.map((action, index) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => handleAction(action.href)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-full text-white shadow-lg",
                "transition-all duration-300 transform",
                "hover:scale-105 hover:shadow-xl",
                action.color,
                isOpen ? "animate-slide-up" : ""
              )}
              style={{ 
                animationDelay: `${index * 50}ms`,
                animationFillMode: 'backwards'
              }}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium whitespace-nowrap">{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main FAB button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center",
          "transition-all duration-300 transform",
          "hover:scale-110 hover:shadow-xl",
          isOpen 
            ? "bg-destructive rotate-45" 
            : "bg-primary hover:bg-primary/90",
          "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Plus className="w-6 h-6 text-primary-foreground" />
        )}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
