import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SidebarProvider } from "@/contexts/SidebarContext";
import LandingPage from "./pages/LandingPage";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Servers from "./pages/Servers";
import Plans from "./pages/Plans";
import Customers from "./pages/Customers";
import Payments from "./pages/Payments";
import Billing from "./pages/Billing";
import MassBroadcast from "./pages/MassBroadcast";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import Resellers from "./pages/Resellers";
import SubResellers from "./pages/SubResellers";
import Tutorial from "./pages/Tutorial";
import BotTriggers from "./pages/BotTriggers";
import Expenses from "./pages/Expenses";
import MessageLogs from "./pages/MessageLogs";
import NotFound from "./pages/NotFound";
import MetaCallback from "./pages/MetaCallback";
import PaymentConfirmation from "./pages/PaymentConfirmation";
import ConflictRenewal from "./pages/ConflictRenewal";
import ActivationApps from "./pages/ActivationApps";
import ConsultaDue from "./pages/ConsultaDue";
import MetaTemplates from "./pages/MetaTemplates";
import MetaChat from "./pages/MetaChat";
import PublicCheckout from "./pages/PublicCheckout";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function AutoBackup() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const runBackup = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase.functions.invoke('auto-backup');
        console.log('[Backup] Auto-backup executado');
      } catch (e) { console.error('[Backup] Erro:', e); }
    };
    runBackup();
    const interval = setInterval(runBackup, 10 * 60 * 1000); // 10 min
    return () => clearInterval(interval);
  }, [user]);
  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <Auth />} />
      <Route path="/meta-callback" element={<MetaCallback />} />
      <Route path="/pedido/:id" element={<PaymentConfirmation />} />
      <Route path="/confirmar-renovacao" element={<ConflictRenewal />} />
      <Route path="/consulta" element={<ConsultaDue />} />
      <Route path="/checkout/:userId" element={<PublicCheckout />} />
      <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/servers" element={<ProtectedRoute><Servers /></ProtectedRoute>} />
      <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
      <Route path="/mass-broadcast" element={<ProtectedRoute><MassBroadcast /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/bot-triggers" element={<ProtectedRoute><BotTriggers /></ProtectedRoute>} />
      <Route path="/tutorial" element={<ProtectedRoute><Tutorial /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/resellers" element={<ProtectedRoute><Resellers /></ProtectedRoute>} />
      <Route path="/sub-resellers" element={<ProtectedRoute><SubResellers /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/message-logs" element={<ProtectedRoute><MessageLogs /></ProtectedRoute>} />
      <Route path="/activation-apps" element={<ProtectedRoute><ActivationApps /></ProtectedRoute>} />
      <Route path="/meta-templates" element={<ProtectedRoute><MetaTemplates /></ProtectedRoute>} />
      <Route path="/meta-chat" element={<ProtectedRoute><MetaChat /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AutoBackup />
            <SidebarProvider>
              <AppRoutes />
            </SidebarProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
