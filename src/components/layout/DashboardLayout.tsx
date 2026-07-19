import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import PendingManualRenewalsFloat from '@/components/PendingManualRenewalsFloat';
import { applyTheme, resetThemeVars, loadTheme } from '@/lib/panel-theme';

interface DashboardLayoutProps {
  children: ReactNode;
  noPadding?: boolean;
}

export default function DashboardLayout({ children, noPadding }: DashboardLayoutProps) {
  const { collapsed } = useSidebar();
  const location = useLocation();
  const isChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat-');

  // Apply the per-user panel theme ONLY inside the authenticated dashboard,
  // so the public landing page keeps its original brand colors.
  useEffect(() => {
    const t = loadTheme();
    if (t) applyTheme(t);
    // Only reset runtime vars on unmount — keep the saved theme intact.
    return () => resetThemeVars();
  }, []);

  // Rotas que renderizam seu próprio painel de pendências (evitar duplicar).
  const hidePendingFloat = [
    '/chat',
    '/chat-crm-oficial',
    '/crm-oficial-channels',
    '/crm-oficial-templates',
    '/crm-oficial-chatbots',
  ].some(path => location.pathname.startsWith(path));

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className={cn(
        "pt-16 lg:pt-0 box-border",
        isChatRoute ? "relative h-[100dvh] overflow-hidden transition-none" : "min-h-screen transition-all duration-300",
        collapsed ? "lg:ml-16" : "lg:ml-64"
      )}>
        <div className={cn(noPadding ? (isChatRoute ? 'absolute inset-0 pt-16 lg:pt-0 overflow-hidden' : '') : 'p-3 sm:p-4 lg:p-8')}>
          {children}
        </div>
      </main>
      {!hidePendingFloat && <PendingManualRenewalsFloat />}
    </div>
  );
}

