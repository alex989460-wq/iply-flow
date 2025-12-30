import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, QrCode, CheckCircle2, Wifi, WifiOff, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WhatsAppSettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<{
    connected: boolean;
    status: string;
    phone?: string;
    name?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchQRCode = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'buscar-qrcode' },
      });

      if (fnError) throw fnError;

      if (data?.success && data?.data) {
        if (data.data.connected) {
          setSessionStatus({
            connected: true,
            status: data.data.status || 'CONNECTED',
            phone: data.data.phone,
            name: data.data.name,
          });
          setQrCode(null);
          toast({ title: 'Sessão já conectada!', description: 'O WhatsApp já está vinculado.' });
        } else if (data.data.qrCode) {
          setQrCode(data.data.qrCode);
          setSessionStatus({ connected: false, status: data.data.status || 'NEED_SCAN' });
        }
      } else {
        setError(data?.error || 'Não foi possível obter o QR Code');
        toast({
          title: 'Erro ao buscar QR Code',
          description: data?.error || 'Tente novamente',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('Error fetching QR code:', err);
      setError(err.message || 'Erro ao buscar QR Code');
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao buscar QR Code',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checkStatus = async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('zap-responder', {
        body: { action: 'verificar-status' },
      });

      if (fnError) throw fnError;

      if (data?.success && data?.data) {
        setSessionStatus({
          connected: data.data.connected,
          status: data.data.status,
          phone: data.data.phone,
          name: data.data.name,
        });

        if (data.data.connected) {
          setQrCode(null);
          toast({ title: 'Conectado!', description: 'WhatsApp vinculado com sucesso.' });
        }
      }
    } catch (err) {
      console.error('Error checking status:', err);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // Auto-refresh QR code every 30 seconds if showing QR
  useEffect(() => {
    if (qrCode && !sessionStatus?.connected) {
      const interval = setInterval(() => {
        checkStatus();
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [qrCode, sessionStatus?.connected]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações WhatsApp</h1>
          <p className="text-muted-foreground">
            Conecte sua conta do WhatsApp escaneando o QR Code
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                Status da Conexão
              </CardTitle>
              <CardDescription>
                Verifique se o WhatsApp está conectado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center",
                  sessionStatus?.connected 
                    ? "bg-success/20 text-success" 
                    : "bg-destructive/20 text-destructive"
                )}>
                  {sessionStatus?.connected ? (
                    <Wifi className="w-8 h-8" />
                  ) : (
                    <WifiOff className="w-8 h-8" />
                  )}
                </div>
                <div>
                  <p className={cn(
                    "text-lg font-semibold",
                    sessionStatus?.connected ? "text-success" : "text-destructive"
                  )}>
                    {sessionStatus?.connected ? 'Conectado' : 'Desconectado'}
                  </p>
                  {sessionStatus?.phone && (
                    <p className="text-sm text-muted-foreground">
                      Telefone: {sessionStatus.phone}
                    </p>
                  )}
                  {sessionStatus?.name && (
                    <p className="text-sm text-muted-foreground">
                      Nome: {sessionStatus.name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Status: {sessionStatus?.status || 'Desconhecido'}
                  </p>
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={checkStatus}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Atualizar Status
              </Button>
            </CardContent>
          </Card>

          {/* QR Code Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                QR Code
              </CardTitle>
              <CardDescription>
                Escaneie o QR Code com o WhatsApp do seu celular
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {isLoading ? (
                <div className="w-64 h-64 flex items-center justify-center bg-secondary/50 rounded-lg">
                  <Loader2 className="w-12 h-12 animate-spin text-primary" />
                </div>
              ) : sessionStatus?.connected ? (
                <div className="w-64 h-64 flex flex-col items-center justify-center bg-success/10 rounded-lg border-2 border-success/30">
                  <CheckCircle2 className="w-16 h-16 text-success mb-4" />
                  <p className="text-success font-semibold text-lg">Já Conectado!</p>
                  <p className="text-muted-foreground text-sm text-center mt-2">
                    Seu WhatsApp está vinculado e pronto para uso
                  </p>
                </div>
              ) : qrCode ? (
                <div className="space-y-4">
                  <div className="p-4 bg-white rounded-lg shadow-lg">
                    <img 
                      src={qrCode} 
                      alt="QR Code WhatsApp" 
                      className="w-56 h-56 object-contain"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={fetchQRCode}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Atualizar QR Code
                  </Button>
                </div>
              ) : (
                <div className="w-64 h-64 flex flex-col items-center justify-center bg-secondary/50 rounded-lg">
                  <QrCode className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center mb-4">
                    Clique no botão abaixo para gerar o QR Code
                  </p>
                  <Button onClick={fetchQRCode} disabled={isLoading}>
                    {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Gerar QR Code
                  </Button>
                </div>
              )}

              {error && !qrCode && !sessionStatus?.connected && (
                <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Como conectar</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Clique em "Gerar QR Code" acima</li>
              <li>Abra o WhatsApp no seu celular</li>
              <li>Toque em Menu (⋮) ou Configurações</li>
              <li>Selecione "Aparelhos conectados"</li>
              <li>Toque em "Conectar um aparelho"</li>
              <li>Aponte a câmera do celular para o QR Code</li>
              <li>Aguarde a conexão ser estabelecida</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
