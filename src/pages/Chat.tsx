import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ChatInterface from '@/components/chat/ChatInterface';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, Settings, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Chat() {
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [isLoadingDept, setIsLoadingDept] = useState(true);

  const { data: zapSettings } = useQuery({
    queryKey: ['zap-responder-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zap_responder_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Use saved department or fetch first available
  useEffect(() => {
    const initDepartment = async () => {
      setIsLoadingDept(true);
      
      // First check if there's a saved department
      if (zapSettings?.selected_department_id) {
        setDepartmentId(zapSettings.selected_department_id);
        setIsLoadingDept(false);
        return;
      }

      // If no saved department, try to fetch and use the first one
      if (zapSettings?.selected_session_id) {
        try {
          const { data: deptData } = await supabase.functions.invoke('zap-responder', {
            body: { action: 'departamentos' },
          });

          if (deptData?.success && deptData?.data?.[0]) {
            setDepartmentId(deptData.data[0].id);
          }
        } catch (error) {
          console.error('Error fetching department:', error);
        }
      }
      
      setIsLoadingDept(false);
    };

    initDepartment();
  }, [zapSettings?.selected_session_id, zapSettings?.selected_department_id]);

  const needsConfiguration = !zapSettings?.selected_session_id;
  const needsDepartment = !departmentId && !isLoadingDept;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <MessageCircle className="w-8 h-8 text-primary" />
              Chat
            </h1>
            <p className="text-muted-foreground mt-1">Converse com seus clientes pelo WhatsApp</p>
          </div>
          
          {zapSettings?.selected_department_name && (
            <div className="text-sm text-muted-foreground">
              Departamento: <span className="font-medium text-foreground">{zapSettings.selected_department_name}</span>
            </div>
          )}
        </div>

        {isLoadingDept ? (
          <Card className="glass-card border-border/50">
            <CardContent className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : needsConfiguration ? (
          <Card className="glass-card border-border/50">
            <CardContent className="py-8">
              <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg text-center">
                <p className="text-warning text-sm mb-3">
                  Configure uma sessão do Zap Responder na página de Cobranças para utilizar o chat.
                </p>
                <Link to="/billing">
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Ir para Configuração
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : needsDepartment ? (
          <Card className="glass-card border-border/50">
            <CardContent className="py-8">
              <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg text-center">
                <p className="text-warning text-sm mb-3">
                  Selecione um departamento padrão na página de Cobranças para enviar mensagens.
                </p>
                <Link to="/billing">
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Configurar Departamento
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <ChatInterface departmentId={departmentId || undefined} />
        )}
      </div>
    </DashboardLayout>
  );
}
