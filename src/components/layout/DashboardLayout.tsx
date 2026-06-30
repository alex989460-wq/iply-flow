import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';
import PendingManualRenewalsFloat from '@/components/PendingManualRenewalsFloat';

interface DashboardLayoutProps {
  children: ReactNode;
  noPadding?: boolean;
}

export default function DashboardLayout({ children, noPadding }: DashboardLayoutProps) {
  const { collapsed } = useSidebar();
  const location = useLocation();
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
        "pt-16 lg:pt-0 min-h-screen transition-all duration-300",
        collapsed ? "lg:ml-16" : "lg:ml-64"
      )}>
        <div className={cn(noPadding ? '' : 'p-3 sm:p-4 lg:p-8')}>
          {children}
        </div>
      </main>
      {!hidePendingFloat && <PendingManualRenewalsFloat />}
    </div>
  );
}

