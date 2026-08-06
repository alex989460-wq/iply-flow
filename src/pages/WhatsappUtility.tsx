import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldCheck, Zap, Bot, MessageSquare, Search, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function WhatsappUtility() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <h1 className="text-2xl font-bold text-destructive">Acesso Negado</h1>
          <p>Esta ferramenta é exclusiva para administradores.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
        <div className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Badge variant="outline" className="border-primary/30 text-primary mb-3">
              <ShieldCheck className="w-3 h-3 mr-1" /> WhatsApp Utility Agent
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold">Agente de Utilidades WhatsApp</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Ferramenta 100% em Português (BR) para automação e gestão de utilidades.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {}} disabled={loading}>
              <RefreshCw className={loading ? "w-4 h-4 mr-2 animate-spin" : "w-4 h-4 mr-2"} /> Sincronizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" /> Configuração do Agente
              </CardTitle>
              <CardDescription>
                Configure as chaves e comportamentos do agente de utilidades.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-8 border border-dashed rounded-xl text-center text-muted-foreground">
                <p>Integração do Agente Python em andamento...</p>
                <p className="text-xs mt-2 italic">Ref: whatsapp_utility_agent-main</p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status do Sistema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span>Tradução PT-BR</span>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">100%</Badge>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Conexão Meta</span>
                  <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10">Ativa</Badge>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span>Agente Python</span>
                  <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10">Standby</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
