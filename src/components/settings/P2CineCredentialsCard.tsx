import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle, Monitor } from 'lucide-react';

export default function P2CineCredentialsCard() {
  const [tokenLoading, setTokenLoading] = useState(false);

  const downloadExtension = () => {
    fetch('/p2cine-extension.zip')
      .then(r => { if (!r.ok) throw new Error('Falha ao baixar'); return r.blob(); })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'supergestor-extension.zip';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(e => toast.error(e.message));
  };

  const copyToken = async () => {
    setTokenLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('p2cine-extension-token');
      if (error) throw error;
      if (!data?.token) throw new Error('Token indisponível');
      await navigator.clipboard.writeText(data.token);
      toast.success('Token copiado! Cole no popup da extensão.');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao obter token');
    } finally {
      setTokenLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>Extensão SuperGestor (Uniplay)</CardTitle>
            <CardDescription>
              Renovação protegida usando a sessão real do seu navegador
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs space-y-2">
            <p>
              <strong>Renovação automática via extensão do navegador:</strong> apenas o Uniplay
              ainda precisa da sessão real do Chrome (o reCAPTCHA do Google não pode ser
              contornado pelo servidor). A extensão roda dentro do <em>seu</em> navegador, usando a
              aba logada em <span className="font-mono">searchdefense.top</span>.
            </p>
            <p>
              O <strong>P2Cine (kOffice)</strong> não usa mais a extensão: agora ele renova
              automaticamente pela API nativa do painel, direto no servidor.
            </p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Baixe o ZIP abaixo e descompacte.</li>
              <li>Abra <span className="font-mono">chrome://extensions</span>, ative "Modo desenvolvedor".</li>
              <li>Clique "Carregar sem compactação" e selecione a pasta descompactada.</li>
              <li>Abra o ícone da extensão, cole o token, ative e mantenha a aba do Uniplay logada.</li>
            </ol>
          </AlertDescription>
        </Alert>

        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Extensão SuperGestor 2.1.0</p>
              <p className="text-xs text-muted-foreground">Renova o Uniplay e mantém a sessão IBO Sol viva automaticamente.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={downloadExtension}>
              Baixar extensão
            </Button>
          </div>
          <div className="text-xs">
            <p className="text-muted-foreground mb-1">
              Token da extensão (individual da sua conta — só processa pendências suas). Se você já
              usava a extensão antes, copie o token novamente e cole no popup.
            </p>

            <Button size="sm" variant="outline" className="mt-1" onClick={copyToken} disabled={tokenLoading}>
              {tokenLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Copiar token
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
