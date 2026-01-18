import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Server,
  Package,
  Users,
  CreditCard,
  MessageSquare,
  LogOut,
  Tv,
  ChevronLeft,
  Menu,
  Send,
  MessagesSquare,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Server, label: 'Servidores', path: '/servers' },
  { icon: Package, label: 'Planos', path: '/plans' },
  { icon: Users, label: 'Clientes', path: '/customers' },
  { icon: CreditCard, label: 'Pagamentos', path: '/payments' },
  { icon: MessageSquare, label: 'Cobranças', path: '/billing' },
  { icon: Send, label: 'Disparo em Massa', path: '/mass-broadcast' },
  { icon: MessagesSquare, label: 'Chat', path: '/chat' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

export default function Sidebar() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const { collapsed, setCollapsed, toggle } = useSidebar();

  return (
    <>
      {/* Mobile overlay */}
      <div className={cn(
        "fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden transition-opacity",
        collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
      )} onClick={() => setCollapsed(true)} />

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64",
        "lg:translate-x-0",
        collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className={cn("flex items-center gap-3 overflow-hidden", collapsed && "lg:justify-center")}>
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Tv className="w-5 h-5 text-primary" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-foreground">IPTV CRM</span>
                <span className="text-xs text-muted-foreground">Painel Admin</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex"
            onClick={toggle}
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "sidebar-link",
                  isActive && "active",
                  collapsed && "lg:justify-center lg:px-2"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-sidebar-border space-y-2">
          {!collapsed && user && (
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-foreground truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className={cn(
              "sidebar-link w-full text-destructive hover:text-destructive hover:bg-destructive/10",
              collapsed && "lg:justify-center lg:px-2"
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Mobile toggle button */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-background/95 backdrop-blur-sm border-b border-border z-30 lg:hidden flex items-center px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 ml-3">
          <Tv className="w-5 h-5 text-primary" />
          <span className="font-bold text-foreground">IPTV CRM</span>
        </div>
      </div>
    </>
  );
}
