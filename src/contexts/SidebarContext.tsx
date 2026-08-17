import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const isMobileScreen = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;

export function SidebarProvider({ children }: { children: ReactNode }) {
  // No mobile a sidebar começa fechada para não cobrir o conteúdo.
  const [collapsed, setCollapsed] = useState(() => isMobileScreen());
  const location = useLocation();

  // Fecha automaticamente ao navegar no mobile.
  useEffect(() => {
    if (isMobileScreen()) setCollapsed(true);
  }, [location.pathname]);

  // Ao redimensionar para mobile, garante que fique fechada.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => setCollapsed(!collapsed);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
