import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import PendingManualRenewalsFloat from '@/components/PendingManualRenewalsFloat';
import InstallAppFloat from '@/components/InstallAppFloat';
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

  // Sempre exibir o painel flutuante de pendências em todas as rotas.
  const hidePendingFloat = false;

  return (
    <div className="min-h-screen bg-background flex selection:bg-primary/30">
      <Sidebar />
      <main className={cn(
        "flex-1 min-w-0 pt-14 lg:pt-0 box-border relative",
        isChatRoute ? "h-[100dvh] overflow-hidden" : "min-h-screen"
      )}>
        <div className={cn(
          "w-full max-w-[2000px] mx-auto h-full",
          noPadding ? (isChatRoute ? 'absolute inset-0 pt-14 lg:pt-0 overflow-hidden' : '') : 'p-3 sm:p-4 lg:p-8 xl:p-10'
        )}>
          {children}
        </div>
      </main>
      {!hidePendingFloat && <PendingManualRenewalsFloat />}
      <InstallAppFloat />
    </div>
  );
}

