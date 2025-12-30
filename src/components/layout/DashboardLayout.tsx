import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pt-16 lg:pt-0 lg:ml-64 min-h-screen transition-all duration-300">
        <div className="p-3 sm:p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
