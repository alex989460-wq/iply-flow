import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, CheckCircle2, Wifi, WifiOff, RefreshCw, Facebook, Unplug, MessageCircle } from 'lucide-react';
import { useWhatsAppEmbeddedSignup } from '@/hooks/useWhatsAppEmbeddedSignup';
import { useToast } from '@/hooks/use-toast';

interface MetaConnectionStatus {
  connected: boolean;
  expired?: boolean;
  user_id?: string;
  phone_number_id?: string;
  display_phone?: string;
  connected_at?: string;
  expires_at?: string;
}

interface EmbeddedSignupSectionProps {
  metaConnectionStatus: MetaConnectionStatus | null;
  connectingMeta: boolean;
  setConnectingMeta: (value: boolean) => void;
  checkMetaConnectionStatus: () => Promise<void>;
  disconnectMeta: () => Promise<void>;
  connectWithFacebook: () => Promise<void>;
}

export function EmbeddedSignupSection({
  metaConnectionStatus,
  connectingMeta,
  setConnectingMeta,
  checkMetaConnectionStatus,
  disconnectMeta,
  connectWithFacebook,
}: EmbeddedSignupSectionProps) {
  const { toast } = useToast();
  const { launchWhatsAppSignup, isLoading: embeddedLoading, isSDKLoaded } = useWhatsAppEmbeddedSignup();

  const handleEmbeddedSignup = async () => {
    setConnectingMeta(true);
    try {
      const success = await launchWhatsAppSignup();
      if (success) {
        await checkMetaConnectionStatus();
      }
    } finally {
      setConnectingMeta(false);
    }
  };

  if (!metaConnectionStatus?.connected) {
    return (
      <>
        <Alert>
          <MessageCircle className="h-4 w-4" />
          <AlertDescription>
            Conecte seu WhatsApp Business com um clique! O processo é igual ao ManyChat - rápido e seguro.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col items-center gap-6 py-8">
          {/* Main Embedded Signup Button */}
          <div className="text-center space-y-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
              <MessageCircle className="w-12 h-12 text-white" />
            </div>
            
            <h3 className="text-lg font-semibold">WhatsApp Business API</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Conecte sua conta do WhatsApp Business em segundos. Sem complicação, sem tokens manuais.
            </p>
          </div>

          <Button
            size="lg"
            onClick={handleEmbeddedSignup}
            disabled={connectingMeta || embeddedLoading || !isSDKLoaded}
            className="bg-green-600 hover:bg-green-700 text-lg px-8 py-6 h-auto"
          >
            {(connectingMeta || embeddedLoading) ? (
              <Loader2 className="w-6 h-6 mr-3 animate-spin" />
            ) : (
              <MessageCircle className="w-6 h-6 mr-3" />
            )}
            Conectar WhatsApp Business
          </Button>

          {!isSDKLoaded && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Carregando Facebook SDK...
            </p>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Powered by</span>
            <Facebook className="w-4 h-4 text-blue-600" />
            <span>Meta Business</span>
          </div>
        </div>

        {/* Fallback OAuth Option */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span>Problemas com o botão acima?</span>
            <Button
              variant="link"
              size="sm"
              onClick={connectWithFacebook}
              disabled={connectingMeta}
              className="text-blue-600"
            >
              <Facebook className="w-4 h-4 mr-1" />
              Login clássico com Facebook
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Alert>
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <AlertDescription>
          Sua conta do Facebook está conectada! Agora vá para a aba "Meus Números" para selecionar qual número usar.
        </AlertDescription>
      </Alert>

      <div className="p-4 bg-muted/50 rounded-lg space-y-3">
        <h4 className="font-medium">Detalhes da Conexão</h4>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status:</span>
            <Badge className="bg-green-500">Conectado</Badge>
          </div>
          {metaConnectionStatus.display_phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Número Ativo:</span>
              <span className="font-mono">{metaConnectionStatus.display_phone}</span>
            </div>
          )}
          {metaConnectionStatus.connected_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Conectado em:</span>
              <span>{new Date(metaConnectionStatus.connected_at).toLocaleDateString('pt-BR')}</span>
            </div>
          )}
          {metaConnectionStatus.expires_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token expira em:</span>
              <span>{new Date(metaConnectionStatus.expires_at).toLocaleDateString('pt-BR')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleEmbeddedSignup}
          disabled={connectingMeta || embeddedLoading}
        >
          {(connectingMeta || embeddedLoading) ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Reconectar
        </Button>
        <Button
          variant="destructive"
          onClick={disconnectMeta}
        >
          <Unplug className="w-4 h-4 mr-2" />
          Desconectar
        </Button>
      </div>
    </>
  );
}
