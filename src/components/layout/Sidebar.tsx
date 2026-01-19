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
  ChevronLeft,
  Menu,
  Send,
  MessagesSquare,
  Settings,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import logoSg from '@/assets/logo-sg.png';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', adminOnly: false },
  { icon: Server, label: 'Servidores', path: '/servers', adminOnly: false },
  { icon: Package, label: 'Planos', path: '/plans', adminOnly: false },
  { icon: Users, label: 'Clientes', path: '/customers', adminOnly: false },
  { icon: CreditCard, label: 'Pagamentos', path: '/payments', adminOnly: false },
  { icon: MessageSquare, label: 'Cobranças', path: '/billing', adminOnly: false },
  { icon: Send, label: 'Disparo em Massa', path: '/mass-broadcast', adminOnly: false },
  { icon: MessagesSquare, label: 'Chat', path: '/chat', adminOnly: false },
  { icon: UserCheck, label: 'Revendedores', path: '/resellers', adminOnly: true },
  { icon: Settings, label: 'Configurações', path: '/settings', adminOnly: false },
];

export default function Sidebar() {
  const { signOut, user, isAdmin } = useAuth();
  const location = useLocation();
  const { collapsed, setCollapsed, toggle } = useSidebar();
  
  const filteredMenuItems = menuItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile overlay */}
      <div className={cn(
        "fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300",
        collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
      )} onClick={() => setCollapsed(true)} />

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-screen bg-sidebar border-r border-sidebar-border flex flex-col",
        "transition-all duration-300 ease-out",
        collapsed ? "w-16" : "w-64",
        "lg:translate-x-0",
        collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          <div className={cn("flex items-center gap-3 overflow-hidden", collapsed && "lg:justify-center")}>
            <img src={logoSg} alt="Super Gestor" className="w-10 h-10 object-contain flex-shrink-0" />
            {!collapsed && (
              <div className="flex flex-col animate-fade-in">
                <span className="font-bold text-foreground">Super Gestor</span>
                <span className="text-xs text-muted-foreground">Painel Admin</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex hover:bg-secondary/80 transition-colors"
            onClick={toggle}
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform duration-300", collapsed && "rotate-180")} />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredMenuItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                style={{ animationDelay: `${index * 30}ms` }}
                className={cn(
                  "sidebar-link animate-fade-in",
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
          {/* Theme Toggle */}
          <ThemeToggle collapsed={collapsed} />
          
          {!collapsed && user && (
            <div className="px-3 py-2 rounded-lg bg-secondary/30">
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
      <div className="fixed top-0 left-0 right-0 h-14 bg-background/95 backdrop-blur-md border-b border-border z-30 lg:hidden flex items-center px-4 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          className="hover:bg-secondary/80"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 ml-3">
          <img src={logoSg} alt="Super Gestor" className="w-8 h-8 object-contain" />
          <span className="font-bold text-foreground">Super Gestor</span>
        </div>
      </div>
    </>
  );
}
