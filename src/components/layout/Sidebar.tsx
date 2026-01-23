import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  HardDrive,
  Layers3,
  Users2,
  Wallet,
  Receipt,
  Megaphone,
  MessageCircleMore,
  LogOut,
  ChevronLeft,
  Menu,
  Sparkles,
  GraduationCap,
  UserCog,
  Cog,
  Bot,
  Reply,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import logoSg from '@/assets/logo-sg.png';

const menuItems = [
  { icon: LayoutGrid, label: 'Dashboard', path: '/dashboard', adminOnly: false },
  { icon: HardDrive, label: 'Servidores', path: '/servers', adminOnly: false },
  { icon: Layers3, label: 'Planos', path: '/plans', adminOnly: false },
  { icon: Users2, label: 'Clientes', path: '/customers', adminOnly: false },
  { icon: Wallet, label: 'Pagamentos', path: '/payments', adminOnly: false },
  { icon: Receipt, label: 'Cobranças', path: '/billing', adminOnly: false },
  { icon: Megaphone, label: 'Disparo em Massa', path: '/mass-broadcast', adminOnly: false },
  { icon: MessageCircleMore, label: 'Chat', path: '/chat', adminOnly: false },
  { icon: Bot, label: 'Gatilhos de Bot', path: '/bot-triggers', adminOnly: false },
  { icon: Reply, label: 'Respostas Auto', path: '/auto-replies', adminOnly: false },
  { icon: GraduationCap, label: 'Tutorial', path: '/tutorial', adminOnly: false },
  { icon: UserCog, label: 'Revendedores', path: '/resellers', adminOnly: true },
  { icon: Cog, label: 'Configurações', path: '/settings', adminOnly: false },
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
        "fixed top-0 left-0 z-50 h-screen bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95 border-r border-sidebar-border/50 flex flex-col shadow-xl",
        "transition-all duration-300 ease-out",
        collapsed ? "w-16" : "w-64",
        "lg:translate-x-0",
        collapsed ? "-translate-x-full lg:translate-x-0" : "translate-x-0"
      )}>
        {/* Logo */}
        <div className={cn(
          "flex items-center justify-between border-b border-sidebar-border/50 bg-sidebar/50 backdrop-blur-sm",
          collapsed ? "h-20 px-2 flex-col py-2" : "h-16 px-4"
        )}>
          <div className={cn(
            "flex items-center overflow-hidden",
            collapsed ? "lg:flex-col lg:gap-1" : "gap-3"
          )}>
            <img 
              src={logoSg} 
              alt="Super Gestor" 
              className={cn(
                "object-contain flex-shrink-0 drop-shadow-lg transition-all duration-300",
                collapsed ? "w-10 h-10" : "w-20 h-20 -my-2"
              )} 
            />
            {!collapsed && (
              <div className="flex flex-col animate-fade-in">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  Super Gestor
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </span>
                <span className="text-xs text-muted-foreground">Painel Admin</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "hidden lg:flex hover:bg-secondary/80 transition-colors",
              collapsed && "w-8 h-8"
            )}
            onClick={toggle}
          >
            <ChevronLeft className={cn("w-4 h-4 transition-transform duration-300", collapsed && "rotate-180")} />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          {filteredMenuItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                style={{ animationDelay: `${index * 30}ms` }}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 animate-fade-in",
                  "hover:bg-gradient-to-r hover:from-primary/10 hover:to-primary/5",
                  isActive 
                    ? "bg-gradient-to-r from-primary/20 to-primary/10 text-primary shadow-sm border border-primary/20" 
                    : "text-muted-foreground hover:text-foreground",
                  collapsed && "lg:justify-center lg:px-2"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center rounded-lg transition-all duration-200",
                  collapsed ? "w-10 h-10" : "w-8 h-8",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" 
                    : "bg-secondary/50 group-hover:bg-secondary group-hover:scale-105"
                )}>
                  <item.icon className={cn(collapsed ? "w-5 h-5" : "w-4 h-4")} />
                </div>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-sidebar-border/50 space-y-2 bg-sidebar/50 backdrop-blur-sm">
          {/* Theme Toggle */}
          <ThemeToggle collapsed={collapsed} />
          
          {!collapsed && user && (
            <div className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-secondary/50 to-secondary/30 border border-border/50">
              <p className="text-sm font-medium text-foreground truncate">
                {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-all duration-200",
              "text-destructive hover:bg-destructive/10 hover:shadow-sm",
              collapsed && "lg:justify-center lg:px-2"
            )}
          >
            <div className={cn(
              "flex items-center justify-center rounded-lg bg-destructive/10",
              collapsed ? "w-10 h-10" : "w-8 h-8"
            )}>
              <LogOut className={cn(collapsed ? "w-5 h-5" : "w-4 h-4")} />
            </div>
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>

      {/* Mobile toggle button */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-background/95 backdrop-blur-md border-b border-border/50 z-30 lg:hidden flex items-center px-4 shadow-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          className="hover:bg-secondary/80"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 ml-3">
          <img src={logoSg} alt="Super Gestor" className="w-16 h-16 object-contain -my-2" />
          <span className="font-bold text-foreground flex items-center gap-1.5">
            Super Gestor
            <Sparkles className="w-3 h-3 text-primary" />
          </span>
        </div>
      </div>
    </>
  );
}