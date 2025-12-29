import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ChatInterface from '@/components/chat/ChatInterface';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

export default function Chat() {
  const [departmentId, setDepartmentId] = useState<string | null>(null);

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

  // Fetch department ID
  useEffect(() => {
    const fetchDepartmentId = async () => {
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
    };

    fetchDepartmentId();
  }, [zapSettings?.selected_session_id]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <MessageCircle className="w-8 h-8 text-primary" />
            Chat
          </h1>
          <p className="text-muted-foreground mt-1">Converse com seus clientes pelo WhatsApp</p>
        </div>

        {!zapSettings?.selected_session_id ? (
          <Card className="glass-card border-border/50">
            <CardContent className="py-8">
              <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg">
                <p className="text-warning text-sm">
                  Configure uma sessão do Zap Responder na página de Cobranças para utilizar o chat.
                </p>
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
