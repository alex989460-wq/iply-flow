import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Save, Eye, EyeOff, AlertCircle, CheckCircle2, Key, Copy, ExternalLink, Plus, Trash2, Zap, Monitor } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import MaskedUrlField from '@/components/ui/masked-url';

export default function ResellerApiSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  const [showCaktoSecret, setShowCaktoSecret] = useState(false);
  const [showCaktoClientSecret, setShowCaktoClientSecret] = useState(false);
  const [showNatvKey, setShowNatvKey] = useState(false);
  const [showTheBestPassword, setShowTheBestPassword] = useState(false);
  const [showRushPassword, setShowRushPassword] = useState(false);
  const [showRushToken, setShowRushToken] = useState(false);
  const [showNatv2Key, setShowNatv2Key] = useState(false);
  const [showUniplayPassword, setShowUniplayPassword] = useState(false);
  const [showVplayPassword, setShowVplayPassword] = useState(false);
  const [showVplayDbPassword, setShowVplayDbPassword] = useState(false);
  const [showSigmaPassword, setShowSigmaPassword] = useState(false);
  const [testingSigma, setTestingSigma] = useState(false);
  const [testingVplay, setTestingVplay] = useState(false);
  const [sigmaConnections, setSigmaConnections] = useState<any[]>([]);
  const [savingSigmaConnection, setSavingSigmaConnection] = useState(false);
  const [generatingBridgeToken, setGeneratingBridgeToken] = useState<string | null>(null);

  const [testingUniplay, setTestingUniplay] = useState(false);
  const [testingP2cine, setTestingP2cine] = useState(false);
  const [connectingP2cine, setConnectingP2cine] = useState(false);
  const [showP2cinePassword, setShowP2cinePassword] = useState(false);
  const [kofficeConnections, setKofficeConnections] = useState<any[]>([]);
  const [savingKofficeConnection, setSavingKofficeConnection] = useState(false);
  const [testingTheBest, setTestingTheBest] = useState(false);

  const [settings, setSettings] = useState({
    cakto_webhook_secret: '',
    cakto_client_id: '',
    cakto_client_secret: '',
    natv_api_key: '',
    natv_base_url: '',
    natv2_api_key: '',
    natv2_base_url: '',
    the_best_api_key: '',
    the_best_username: '',
    the_best_password: '',
    the_best_base_url: '',
    rush_username: '',
    rush_password: '',
    rush_token: '',
    rush_base_url: '',
    uniplay_username: '',
    uniplay_password: '',
    uniplay_base_url: '',
    vplay_panel_username: '',
    vplay_panel_password: '',
    vplay_mysql_host: '',
    vplay_mysql_port: '3306',
    vplay_mysql_user: '',
    vplay_mysql_password: '',
    vplay_mysql_database: '',
    sigma_base_url: '',
    sigma_username: '',
    sigma_password: '',
    p2cine_username: '',
    p2cine_password: '',
    p2cine_base_url: '',
    p2cine_api_key: '',

  });



  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-webhook`;

  useEffect(() => {
    if (user) fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    try {
      const [{ data, error }, { data: connections, error: connectionsError }, { data: kofficeRows }] = await Promise.all([
        supabase.from('reseller_api_settings' as any).select('*').eq('user_id', user?.id).maybeSingle(),
        supabase.from('sigma_panel_connections' as any).select('*').eq('user_id', user?.id).order('created_at'),
        supabase.from('koffice_panel_connections' as any).select('*').eq('user_id', user?.id).order('created_at'),
      ]);

      if (error) throw error;
      if (connectionsError) throw connectionsError;
      setSigmaConnections(connections || []);
      setKofficeConnections(kofficeRows || []);


      if (data) {
        setHasExisting(true);
        const d = data as any;
        setSettings({
          cakto_webhook_secret: d.cakto_webhook_secret || '',
          cakto_client_id: d.cakto_client_id || '',
          cakto_client_secret: d.cakto_client_secret || '',
          natv_api_key: d.natv_api_key || '',
          natv_base_url: d.natv_base_url || '',
          natv2_api_key: d.natv2_api_key || '',
          natv2_base_url: d.natv2_base_url || '',
          the_best_api_key: d.the_best_api_key || '',
          the_best_username: d.the_best_username || '',
          the_best_password: d.the_best_password || '',
          the_best_base_url: d.the_best_base_url || '',
          rush_username: d.rush_username || '',
          rush_password: d.rush_password || '',
          rush_token: d.rush_token || '',
          rush_base_url: d.rush_base_url || '',
          uniplay_username: d.uniplay_username || '',
          uniplay_password: d.uniplay_password || '',
          uniplay_base_url: d.uniplay_base_url || '',
          vplay_panel_username: (d as any).vplay_panel_username || '',
          vplay_panel_password: (d as any).vplay_panel_password || '',
          vplay_mysql_host: d.vplay_mysql_host || '',
          vplay_mysql_port: d.vplay_mysql_port ? String(d.vplay_mysql_port) : '3306',
          vplay_mysql_user: d.vplay_mysql_user || '',
          vplay_mysql_password: d.vplay_mysql_password || '',
          vplay_mysql_database: d.vplay_mysql_database || '',
          sigma_base_url: (d as any).sigma_base_url || '',
          sigma_username: (d as any).sigma_username || '',
          sigma_password: (d as any).sigma_password || '',
          p2cine_username: (d as any).p2cine_username || '',
          p2cine_password: (d as any).p2cine_password || '',
          p2cine_base_url: (d as any).p2cine_base_url || '',
          p2cine_api_key: (d as any).p2cine_api_key || '',

        });

      }
    } catch (err) {
      console.error('Error fetching API settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        cakto_webhook_secret: settings.cakto_webhook_secret || '',
        cakto_client_id: settings.cakto_client_id || '',
        cakto_client_secret: settings.cakto_client_secret || '',
        natv_api_key: settings.natv_api_key || '',
        natv_base_url: settings.natv_base_url || '',
        natv2_api_key: settings.natv2_api_key || '',
        natv2_base_url: settings.natv2_base_url || '',
        the_best_api_key: settings.the_best_api_key || null,
        the_best_username: settings.the_best_username || '',
        the_best_password: settings.the_best_password || '',
        the_best_base_url: settings.the_best_base_url || '',
        rush_username: settings.rush_username || '',
        rush_password: settings.rush_password || '',
        rush_token: settings.rush_token || '',
        rush_base_url: settings.rush_base_url || '',
        uniplay_username: settings.uniplay_username || '',
        uniplay_password: settings.uniplay_password || '',
        uniplay_base_url: settings.uniplay_base_url || '',
        vplay_panel_username: settings.vplay_panel_username || null,
        vplay_panel_password: settings.vplay_panel_password || null,
        vplay_mysql_host: settings.vplay_mysql_host || null,
        vplay_mysql_port: settings.vplay_mysql_port ? Number(settings.vplay_mysql_port) : null,
        vplay_mysql_user: settings.vplay_mysql_user || null,
        vplay_mysql_password: settings.vplay_mysql_password || null,
        vplay_mysql_database: settings.vplay_mysql_database || null,
        sigma_base_url: settings.sigma_base_url || null,
        sigma_username: settings.sigma_username || null,
        sigma_password: settings.sigma_password || null,
        p2cine_username: settings.p2cine_username || null,
        p2cine_password: settings.p2cine_password || null,
        p2cine_base_url: settings.p2cine_base_url || null,
        p2cine_api_key: settings.p2cine_api_key || null,

        updated_at: new Date().toISOString(),
      };

      // Upsert evita erros de "duplicate key" / "0 linhas atualizadas"
      // quando o registro do revendedor já existe (ou foi criado em outra aba).
      const { error } = await supabase
        .from('reseller_api_settings' as any)
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      setHasExisting(true);

      toast({ title: 'Sucesso', description: 'Configurações de API salvas!' });
    } catch (err: any) {
      console.error('Error saving API settings:', err);
      toast({ title: 'Erro', description: err.message || 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!', description: `${label} copiado para a área de transferência` });
  };

  const testTheBest = async () => {
    if (!settings.the_best_api_key && (!settings.the_best_username || !settings.the_best_password)) {
      toast({ title: 'Erro', description: 'Informe a Chave de API ou usuário e senha do painel The Best', variant: 'destructive' });
      return;
    }
    setTestingTheBest(true);
    try {
      const { data, error } = await supabase.functions.invoke('the-best-renew', {
        body: {
          action: 'test',
          the_best_api_key: settings.the_best_api_key,
          the_best_username: settings.the_best_username,
          the_best_password: settings.the_best_password,
          the_best_base_url: settings.the_best_base_url,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha no login');
      toast({ title: 'Conexão OK', description: data.message || 'Credenciais válidas' });
    } catch (err: any) {
      toast({ title: 'Falha na conexão', description: err.message || String(err), variant: 'destructive' });
    } finally {
      setTestingTheBest(false);
    }
  };

  const testUniplay = async () => {
    if (!settings.uniplay_username || !settings.uniplay_password) {
      toast({ title: 'Erro', description: 'Preencha usuário e senha do Uniplay', variant: 'destructive' });
      return;
    }
    setTestingUniplay(true);
    try {
      const { data, error } = await supabase.functions.invoke('uniplay-renew', {
        body: {
          action: 'test',
          uniplay_username: settings.uniplay_username,
          uniplay_password: settings.uniplay_password,
          uniplay_base_url: settings.uniplay_base_url,
        },
      });
      if (error) {
        const context = (error as any)?.context;
        if (context instanceof Response) {
          const text = await context.text().catch(() => '');
          try {
            const json = JSON.parse(text);
            throw new Error(json?.error || json?.message || text || error.message);
          } catch {
            throw new Error(text || error.message);
          }
        }
        throw error;
      }
      if (!data?.success) throw new Error(data?.error || 'Falha no login');
      toast({ title: 'Login OK', description: `Uniplay: ${data.username} (id ${data.id})` });
    } catch (err: any) {
      const message = err.message || String(err);
      toast({
        title: 'Falha ao conectar no Uniplay',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setTestingUniplay(false);
    }
  };

  const testP2cine = async () => {
    if (!settings.p2cine_api_key && (!settings.p2cine_username || !settings.p2cine_password)) {
      toast({ title: 'Dados incompletos', description: 'Preencha a chave de API ou o usuário e a senha do P2Cine.', variant: 'destructive' });
      return;
    }
    setTestingP2cine(true);
    try {
      const { data, error } = await supabase.functions.invoke('p2cine-renew', {
        body: {
          action: 'test',
          p2cine_username: settings.p2cine_username.trim(),
          p2cine_password: settings.p2cine_password,
          p2cine_base_url: settings.p2cine_base_url.trim(),
          p2cine_api_key: settings.p2cine_api_key.trim(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Não foi possível validar a conexão P2Cine.');
      toast({ title: 'Conexão P2Cine OK', description: data.message || `Autenticado como ${data.username}.` });
    } catch (e: any) {
      toast({ title: 'Falha ao conectar no P2Cine', description: e?.message || 'Confira a chave de API, o usuário e a senha.', variant: 'destructive' });
    } finally {
      setTestingP2cine(false);
    }
  };

  const connectP2cine = async () => {
    if (!settings.p2cine_api_key && (!settings.p2cine_username || !settings.p2cine_password)) {
      toast({ title: 'Dados incompletos', description: 'Preencha a chave de API ou o usuário e a senha do P2Cine.', variant: 'destructive' });
      return;
    }
    setConnectingP2cine(true);
    try {
      const { data, error } = await supabase.functions.invoke('p2cine-renew', {
        body: {
          action: 'connect',
          p2cine_username: settings.p2cine_username.trim(),
          p2cine_password: settings.p2cine_password,
          p2cine_base_url: settings.p2cine_base_url.trim(),
          p2cine_api_key: settings.p2cine_api_key.trim(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Não foi possível conectar no P2Cine.');
      toast({ title: 'P2Cine conectado', description: data.message || 'Sessão salva. A renovação funciona sem a extensão.' });
    } catch (e: any) {
      toast({ title: 'Falha ao conectar no P2Cine', description: e?.message || 'Confira o usuário e a senha.', variant: 'destructive' });
    } finally {
      setConnectingP2cine(false);
    }
  };


  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const hasCakto = !!settings.cakto_webhook_secret;
  const hasNatv = !!settings.natv_api_key && !!settings.natv_base_url;
  const hasNatv2 = !!settings.natv2_api_key && !!settings.natv2_base_url;
  const hasTheBest = !!settings.the_best_api_key || (!!settings.the_best_username && !!settings.the_best_password);
  const hasRush = !!settings.rush_username && !!settings.rush_password && !!settings.rush_token;
  const hasUniplay = !!settings.uniplay_username && !!settings.uniplay_password;
  const hasP2cine = (!!settings.p2cine_username && !!settings.p2cine_password) || !!settings.p2cine_api_key;
  const hasSigma = sigmaConnections.length > 0 || (!!settings.sigma_base_url && !!settings.sigma_username && !!settings.sigma_password);

  const handleTestSigma = async (connection?: any) => {
    const targetUrl = connection ? connection.base_url : settings.sigma_base_url;
    const targetUser = connection ? connection.username : settings.sigma_username;
    const targetPass = connection ? connection.password : settings.sigma_password;

    if (!targetUrl.trim() || !targetUser.trim() || !targetPass) {
      toast({ title: 'Dados incompletos', description: 'Informe a URL, o usuário e a senha do Sigma.', variant: 'destructive' });
      return;
    }

    setTestingSigma(true);
    try {
      const { data, error } = await supabase.functions.invoke('sigma-renew', {
        body: {
          action: 'test',
          sigma_base_url: targetUrl.trim(),
          sigma_username: targetUser.trim(),
          sigma_password: targetPass,
          sigma_proxy_url: connection?.proxy_url,
          sigma_proxy_secret: connection?.proxy_secret,
        },
      });

      if (error) {
        const response = (error as any)?.context;
        if (response instanceof Response) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error || error.message);
        }
        throw error;
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const servers = (data as any)?.servers || [];
      toast({
        title: 'Conexão Sigma OK',
        description: `Conectado como ${(data as any)?.username || ''} • ${servers.length} servidor(es) disponível(is).`,
      });
    } catch (e: any) {
      toast({
        title: 'Falha ao conectar no Sigma',
        description: e?.message || 'Verifique URL, usuário e senha e salve antes de testar.',
        variant: 'destructive',
      });
    } finally {
      setTestingSigma(false);
    }
  };

  const addSigmaConnection = async () => {
    if (!user || !settings.sigma_base_url.trim() || !settings.sigma_username.trim() || !settings.sigma_password) {
      toast({ title: 'Dados incompletos', description: 'Informe URL, usuário e senha para adicionar a conexão.', variant: 'destructive' });
      return;
    }
    setSavingSigmaConnection(true);
    try {
      const hostname = settings.sigma_base_url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const { error } = await supabase.from('sigma_panel_connections' as any).insert({
        user_id: user.id,
        name: hostname || 'Painel Sigma',
        base_url: settings.sigma_base_url.trim(),
        username: settings.sigma_username.trim(),
        password: settings.sigma_password,
        is_active: true
      });
      if (error) throw error;
      setSettings((current) => ({ ...current, sigma_base_url: '', sigma_username: '', sigma_password: '' }));

      await fetchSettings();
      toast({ title: 'Conexão Sigma adicionada' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar Sigma', description: error?.message || 'Não foi possível salvar a conexão.', variant: 'destructive' });
    }
  };

  const generateSigmaBridgeToken = async (connectionId: string) => {
    setGeneratingBridgeToken(connectionId);
    try {
      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const { error } = await supabase.from('sigma_panel_connections' as any).update({ bridge_token: token }).eq('id', connectionId);
      if (error) throw error;
      await fetchSettings();
      toast({ title: 'Chave da Ponte gerada', description: 'Agora você pode ativar a ponte para este painel.' });
    } catch (error: any) {
      toast({ title: 'Erro ao gerar chave', description: error.message, variant: 'destructive' });
    } finally {
      setGeneratingBridgeToken(null);
    }
  };

  const revokeSigmaBridgeToken = async (connectionId: string) => {
    try {
      const { error } = await supabase.from('sigma_panel_connections' as any).update({ bridge_token: null }).eq('id', connectionId);
      if (error) throw error;
      await fetchSettings();
      toast({ title: 'Ponte desativada', description: 'A chave da ponte foi removida.' });
    } catch (error: any) {
      toast({ title: 'Erro ao desativar', description: error.message, variant: 'destructive' });
    }
  };

  const getSigmaBridgeBookmarklet = (token: string) => {
    const code = `(function(){
      const TOKEN = "${token}";
      const API = "${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sigma-bridge";
      console.log("[SigmaBridge] Iniciando ponte...");
      
      async function poll() {
        try {
          const res = await fetch(API + "?action=poll", {
            headers: { "x-bridge-token": TOKEN }
          });
          const data = await res.json();
          if (data.jobs && data.jobs.length > 0) {
            for (const job of data.jobs) {
              console.log("[SigmaBridge] Executando tarefa:", job.action);
              try {
                let result;
                if (job.action === "renew_customer") {
                  // Lógica de renovação via fetch na aba do Sigma (usa a sessão da aba)
                  const findRes = await fetch("/api/customers?page=1&keyword=" + encodeURIComponent(job.payload.username), {
                    headers: { "Accept": "application/json", "x-app-version": "3.89" }
                  });
                  const findData = await findRes.json();
                  const customer = (findData.data || []).find(c => c.username.toLowerCase() === job.payload.username.toLowerCase());
                  
                  if (!customer) throw new Error("Cliente não encontrado no Sigma.");
                  
                  // Busca pacotes para bater o mês
                  const serversRes = await fetch("/api/servers", { headers: { "Accept": "application/json", "x-app-version": "3.89" } });
                  const serversData = await serversRes.json();
                  const server = (serversData.data || []).find(s => s.id == customer.server_id);
                  const pkg = (server.packages || []).find(p => !p.is_trial && Math.abs((p.duration_in === 'MONTHS' ? p.duration * 30 : p.duration) - (job.payload.months * 30)) <= 2);
                  const packageId = pkg ? pkg.id : customer.package_id;

                  const renewRes = await fetch("/api/customers/" + customer.id + "/renew", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Accept": "application/json", "x-app-version": "3.89" },
                    body: JSON.stringify({ 
                      package_id: packageId, 
                      connections: job.payload.connections || 1,
                      reference: "",
                      create_manual_customer_order: false,
                      manual_payment_total: null
                    })
                  });
                  const renewData = await renewRes.json();
                  if (!renewRes.ok) throw new Error(renewData.message || "Erro do painel Sigma.");
                  result = renewData.data || renewData;
                }
                
                await fetch(API + "?action=complete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-bridge-token": TOKEN },
                  body: JSON.stringify({ job_id: job.id, response: result })
                });
              } catch (err) {
                console.error("[SigmaBridge] Falha na tarefa:", err);
                await fetch(API + "?action=complete", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-bridge-token": TOKEN },
                  body: JSON.stringify({ job_id: job.id, error: err.message })
                });
              }
            }
          }
        } catch (e) { console.error("[SigmaBridge] Erro no poll:", e); }
        setTimeout(poll, 5000);
      }
      
      poll();
      alert("Ponte Sigma Ativada! Mantenha esta aba aberta.");
    })();`.replace(/\n/g, '').replace(/\s\s+/g, ' ');
    return `javascript:${code}`;
  };

  const removeSigmaConnection = async (id: string) => {
    const { error } = await supabase.from('sigma_panel_connections' as any).delete().eq('id', id).eq('user_id', user?.id);
    if (error) {
      toast({ title: 'Erro ao remover conexão', description: error.message, variant: 'destructive' });
      return;
    }
    setSigmaConnections((current) => current.filter((connection) => connection.id !== id));
    toast({ title: 'Conexão Sigma removida' });
  };

  const addKofficeConnection = async () => {
    if (!user || !settings.p2cine_base_url.trim() || !settings.p2cine_username.trim() || !settings.p2cine_api_key.trim()) {
      toast({
        title: 'Dados incompletos',
        description: 'Informe URL do painel, usuário e chave de API para adicionar o painel kOffice.',
        variant: 'destructive',
      });
      return;
    }
    setSavingKofficeConnection(true);
    try {
      const base = settings.p2cine_base_url.trim();
      const hostname = base.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

      const { data, error } = await supabase.functions.invoke('p2cine-renew', {
        body: {
          action: 'test',
          p2cine_username: settings.p2cine_username.trim(),
          p2cine_password: settings.p2cine_password,
          p2cine_base_url: base,
          p2cine_api_key: settings.p2cine_api_key.trim(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'O painel recusou a conexão.');

      const { error: insertError } = await supabase.from('koffice_panel_connections' as any).insert({
        user_id: user.id,
        name: hostname || 'Painel kOffice',
        base_url: base,
        username: settings.p2cine_username.trim(),
        api_key: settings.p2cine_api_key.trim(),
      });
      if (insertError) throw insertError;

      setSettings((current) => ({ ...current, p2cine_base_url: '', p2cine_username: '', p2cine_password: '', p2cine_api_key: '' }));
      await fetchSettings();
      toast({ title: 'Painel kOffice adicionado', description: data.message || 'Conexão validada e salva.' });
    } catch (e: any) {
      toast({ title: 'Erro ao adicionar painel kOffice', description: e?.message || 'Não foi possível validar a conexão.', variant: 'destructive' });
    } finally {
      setSavingKofficeConnection(false);
    }
  };

  const removeKofficeConnection = async (id: string) => {
    const { error } = await supabase.from('koffice_panel_connections' as any).delete().eq('id', id).eq('user_id', user?.id);
    if (error) {
      toast({ title: 'Erro ao remover painel', description: error.message, variant: 'destructive' });
      return;
    }
    setKofficeConnections((current) => current.filter((c) => c.id !== id));
    toast({ title: 'Painel kOffice removido' });
  };

  const hasVplay = (!!settings.vplay_panel_username && !!settings.vplay_panel_password)
    || (!!settings.vplay_mysql_host && !!settings.vplay_mysql_user && !!settings.vplay_mysql_password && !!settings.vplay_mysql_database);

  const handleTestVplay = async () => {
    const hasOwnMysql = !!settings.vplay_mysql_host.trim() && !!settings.vplay_mysql_user.trim()
      && !!settings.vplay_mysql_password && !!settings.vplay_mysql_database.trim();
    if (!hasOwnMysql && (!settings.vplay_panel_username.trim() || !settings.vplay_panel_password)) {
      toast({ title: 'Dados incompletos', description: 'Informe o seu usuário e a senha do painel VPlay.', variant: 'destructive' });
      return;
    }
    setTestingVplay(true);
    try {
      const { data, error } = await supabase.functions.invoke('vplay-renew', {
        body: {
          action: 'test',
          vplay_panel_username: settings.vplay_panel_username.trim(),
          vplay_panel_password: settings.vplay_panel_password,
          vplay_mysql_host: settings.vplay_mysql_host.trim(),
          vplay_mysql_port: settings.vplay_mysql_port,
          vplay_mysql_user: settings.vplay_mysql_user.trim(),
          vplay_mysql_password: settings.vplay_mysql_password,
          vplay_mysql_database: settings.vplay_mysql_database.trim(),
        },
      });
      if (error) {
        const response = (error as any)?.context;
        if (response instanceof Response) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error || error.message);
        }
        throw error;
      }
      if (!data?.success) throw new Error(data?.error || 'Não foi possível validar a conexão VPlay.');
      toast({ title: 'Conexão VPlay OK', description: data.message || 'Painel e servidor disponíveis.' });
    } catch (e: any) {
      toast({ title: 'Falha ao conectar no VPlay', description: e?.message || 'Confira o usuário e a senha.', variant: 'destructive' });
    } finally {
      setTestingVplay(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Cakto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-orange-500" />
            Cakto (Webhook)
            {hasCakto && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Configure sua integração com a Cakto para renovação automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Como configurar:</strong>
              <ol className="list-decimal ml-4 mt-1 space-y-1 text-sm">
                <li>Acesse o painel da Cakto em <strong>Integrações &gt; Webhooks</strong></li>
                <li>Copie a <strong>URL do Webhook</strong> abaixo e cole na Cakto</li>
                <li>Copie o <strong>Client ID</strong>, <strong>Client Secret</strong> e <strong>Webhook Secret</strong> da Cakto e cole nos campos abaixo</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Webhook URL para copiar */}
          <div className="space-y-2">
            <Label>URL do Webhook (cole na Cakto)</Label>
            <MaskedUrlField url={webhookUrl} label="URL do Webhook" />
            <p className="text-xs text-muted-foreground">
              Cole esta URL no campo de webhook da Cakto
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cakto_client_id">Client ID</Label>
              <Input
                id="cakto_client_id"
                value={settings.cakto_client_id}
                onChange={(e) => setSettings({ ...settings, cakto_client_id: e.target.value })}
                placeholder="Client ID da Cakto"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cakto_client_secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="cakto_client_secret"
                  type={showCaktoClientSecret ? 'text' : 'password'}
                  value={settings.cakto_client_secret}
                  onChange={(e) => setSettings({ ...settings, cakto_client_secret: e.target.value })}
                  placeholder="Client Secret da Cakto"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowCaktoClientSecret(!showCaktoClientSecret)}
                >
                  {showCaktoClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cakto_secret">Webhook Secret</Label>
              <div className="relative">
                <Input
                  id="cakto_secret"
                  type={showCaktoSecret ? 'text' : 'password'}
                  value={settings.cakto_webhook_secret}
                  onChange={(e) => setSettings({ ...settings, cakto_webhook_secret: e.target.value })}
                  placeholder="Cole seu webhook secret da Cakto"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowCaktoSecret(!showCaktoSecret)}
                >
                  {showCaktoSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NATV */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-500" />
            NATV (Painel)
            {hasNatv && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Configure as credenciais do painel NATV para renovação automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="natv_key">API Key</Label>
            <div className="relative">
              <Input
                id="natv_key"
                type={showNatvKey ? 'text' : 'password'}
                value={settings.natv_api_key}
                onChange={(e) => setSettings({ ...settings, natv_api_key: e.target.value })}
                placeholder="Cole sua API Key do NATV"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowNatvKey(!showNatvKey)}
              >
                {showNatvKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="natv_url">URL Base da API</Label>
            <Input
              id="natv_url"
              value={settings.natv_base_url}
              onChange={(e) => setSettings({ ...settings, natv_base_url: e.target.value })}
              placeholder="https://revenda.pixbot.link/api"
            />
            <p className="text-xs text-muted-foreground">
              Ex: https://revenda.pixbot.link/api
            </p>
          </div>
        </CardContent>
      </Card>

      {/* NATV² */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-cyan-500" />
            NATV² (Painel)
            {hasNatv2 && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Configure as credenciais do painel NATV² para renovação automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="natv2_key">API Key</Label>
            <div className="relative">
              <Input
                id="natv2_key"
                type={showNatv2Key ? 'text' : 'password'}
                value={settings.natv2_api_key}
                onChange={(e) => setSettings({ ...settings, natv2_api_key: e.target.value })}
                placeholder="Cole sua API Key do NATV²"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowNatv2Key(!showNatv2Key)}
              >
                {showNatv2Key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="natv2_url">URL Base da API</Label>
            <Input
              id="natv2_url"
              value={settings.natv2_base_url}
              onChange={(e) => setSettings({ ...settings, natv2_base_url: e.target.value })}
              placeholder="https://revenda.exemplo.com/api"
            />
            <p className="text-xs text-muted-foreground">
              Ex: https://revenda.exemplo.com/api
            </p>
          </div>
        </CardContent>
      </Card>

      {/* The Best */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-green-500" />
            The Best (Painel)
            {hasTheBest && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Configure as credenciais do painel The Best para renovação automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Como configurar:</strong>
              <ol className="list-decimal ml-4 mt-1 space-y-1 text-sm">
                <li><strong>Recomendado:</strong> cole a <strong>Chave de API</strong> gerada no seu perfil do painel The Best (campo "API KEY")</li>
                <li>Alternativa: informe <strong>usuário e senha</strong> — o sistema fará login para obter o token JWT</li>
                <li>A URL base padrão é <code>https://api.painel.best</code></li>
              </ol>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="the_best_api_key">Chave de API (API KEY)</Label>
            <Input
              id="the_best_api_key"
              value={settings.the_best_api_key}
              onChange={(e) => setSettings({ ...settings, the_best_api_key: e.target.value })}
              placeholder="Cole aqui a API KEY do seu perfil no painel The Best"
            />
            <p className="text-xs text-muted-foreground">
              Quando preenchida, é usada no lugar do usuário e senha (header Api-Key).
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="the_best_username">Usuário do Revendedor</Label>
              <Input
                id="the_best_username"
                value={settings.the_best_username}
                onChange={(e) => setSettings({ ...settings, the_best_username: e.target.value })}
                placeholder="Seu usuário do painel The Best"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="the_best_password">Senha do Revendedor</Label>
              <div className="relative">
                <Input
                  id="the_best_password"
                  type={showTheBestPassword ? 'text' : 'password'}
                  value={settings.the_best_password}
                  onChange={(e) => setSettings({ ...settings, the_best_password: e.target.value })}
                  placeholder="Sua senha do painel The Best"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowTheBestPassword(!showTheBestPassword)}
                >
                  {showTheBestPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="the_best_url">URL Base da API</Label>
            <Input
              id="the_best_url"
              value={settings.the_best_base_url}
              onChange={(e) => setSettings({ ...settings, the_best_base_url: e.target.value })}
              placeholder="https://api.painel.best"
            />
            <p className="text-xs text-muted-foreground">
              Padrão: https://api.painel.best
            </p>
          </div>

          <Button variant="outline" onClick={testTheBest} disabled={testingTheBest}>
            {testingTheBest ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Testar conexão
          </Button>
        </CardContent>
      </Card>

      {/* Rush */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-500" />
            Rush (Painel)
            {hasRush && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Configure as credenciais do painel Rush para renovação automática (P2P e IPTV)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Como configurar:</strong>
              <ol className="list-decimal ml-4 mt-1 space-y-1 text-sm">
                <li>Use o <strong>usuário</strong> e <strong>senha</strong> da sua revenda Rush</li>
                <li>Cole o <strong>Token de Autorização</strong> fornecido pelo painel</li>
                <li>A URL base padrão é <code>https://api-new.painel.ai</code></li>
              </ol>
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rush_username">Usuário da Revenda</Label>
              <Input
                id="rush_username"
                value={settings.rush_username}
                onChange={(e) => setSettings({ ...settings, rush_username: e.target.value })}
                placeholder="Seu usuário do painel Rush"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rush_password">Senha da Revenda</Label>
              <div className="relative">
                <Input
                  id="rush_password"
                  type={showRushPassword ? 'text' : 'password'}
                  value={settings.rush_password}
                  onChange={(e) => setSettings({ ...settings, rush_password: e.target.value })}
                  placeholder="Sua senha do painel Rush"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowRushPassword(!showRushPassword)}
                >
                  {showRushPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rush_token">Token de Autorização</Label>
            <div className="relative">
              <Input
                id="rush_token"
                type={showRushToken ? 'text' : 'password'}
                value={settings.rush_token}
                onChange={(e) => setSettings({ ...settings, rush_token: e.target.value })}
                placeholder="Token de autorização do Rush"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowRushToken(!showRushToken)}
              >
                {showRushToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rush_url">URL Base da API</Label>
            <Input
              id="rush_url"
              value={settings.rush_base_url}
              onChange={(e) => setSettings({ ...settings, rush_base_url: e.target.value })}
              placeholder="https://api-new.painel.ai"
            />
            <p className="text-xs text-muted-foreground">
              Padrão: https://api-new.painel.ai
            </p>
          </div>
        </CardContent>
      </Card>

      {/* VPlay */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-sky-500" />
            VPlay (Painel)
            {hasVplay && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Credenciais do seu painel VPlay/XUI para renovar seus clientes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vplay_panel_username">Seu Usuário (Painel VPlay)</Label>
              <Input
                id="vplay_panel_username"
                value={settings.vplay_panel_username}
                onChange={(e) => setSettings({ ...settings, vplay_panel_username: e.target.value })}
                placeholder="Seu usuário de revenda no VPlay"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vplay_panel_password">Sua Senha (Painel VPlay)</Label>
              <div className="relative">
                <Input
                  id="vplay_panel_password"
                  type={showVplayPassword ? 'text' : 'password'}
                  value={settings.vplay_panel_password}
                  onChange={(e) => setSettings({ ...settings, vplay_panel_password: e.target.value })}
                  placeholder="Sua senha de revenda no VPlay"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowVplayPassword(!showVplayPassword)}
                >
                  {showVplayPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Alert className="bg-muted/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Basta informar o seu usuário e senha do painel VPlay. A conexão com o servidor já está configurada pelo sistema.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={handleTestVplay} disabled={testingVplay}>
            {testingVplay ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Testar conexão VPlay
          </Button>
        </CardContent>
      </Card>

      {/* Sigma */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-violet-500" />
            Painel Sigma
            {hasSigma && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Conecte qualquer painel Sigma (ex.: painel.newbr.top) para gerar testes e renovar clientes automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sigma_base_url">URL do Painel</Label>
            <Input
              id="sigma_base_url"
              value={settings.sigma_base_url}
              onChange={(e) => setSettings({ ...settings, sigma_base_url: e.target.value })}
              placeholder="https://painel.seudominio.top"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sigma_username">Usuário</Label>
              <Input
                id="sigma_username"
                value={settings.sigma_username}
                onChange={(e) => setSettings({ ...settings, sigma_username: e.target.value })}
                placeholder="Seu usuário no painel Sigma"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sigma_password">Senha</Label>
              <div className="relative">
                <Input
                  id="sigma_password"
                  type={showSigmaPassword ? 'text' : 'password'}
                  value={settings.sigma_password}
                  onChange={(e) => setSettings({ ...settings, sigma_password: e.target.value })}
                  placeholder="Sua senha no painel Sigma"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowSigmaPassword(!showSigmaPassword)}
                >
                  {showSigmaPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>


          <Button variant="outline" onClick={handleTestSigma} disabled={testingSigma}>
            {testingSigma ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Testar conexão Sigma
          </Button>

          <Button type="button" onClick={addSigmaConnection} disabled={savingSigmaConnection}>
            {savingSigmaConnection ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Adicionar conexão Sigma
          </Button>

          {sigmaConnections.length > 0 && (
            <div className="space-y-2">
              <Label>Conexões cadastradas</Label>
              <div className="space-y-3">
                {sigmaConnections.map((connection) => {
                  const isOnline = connection.last_bridge_seen_at && (new Date().getTime() - new Date(connection.last_bridge_seen_at).getTime() < 60000);
                  
                  return (
                    <div key={connection.id} className="flex flex-col gap-3 rounded-md border border-border p-4 bg-muted/30">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{connection.name}</p>
                            {isOnline ? (
                              <Badge variant="outline" className="text-[10px] uppercase py-0 px-1 border-green-500 text-green-500 bg-green-500/10 animate-pulse flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                                Ponte Ativa
                              </Badge>
                            ) : connection.bridge_token && (
                              <Badge variant="outline" className="text-[10px] uppercase py-0 px-1 border-yellow-500 text-yellow-500 bg-yellow-500/10">
                                Ponte Offline
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{connection.base_url} • {connection.username}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleTestSigma(connection)} 
                            disabled={testingSigma}
                          >
                            {testingSigma ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                            Testar
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeSigmaConnection(connection.id)} aria-label="Remover conexão Sigma">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>

                      {/* Controles da Ponte Sigma (Bypass WAF) */}
                      <div className="pt-2 border-t border-border/50 space-y-3">
                        {!connection.bridge_token ? (
                          <div className="flex items-center justify-between bg-background/50 p-2 rounded border border-dashed border-border">
                            <span className="text-xs text-muted-foreground">Ponte manual (Bypass WAF) desativada</span>
                            <Button 
                              size="sm" 
                              variant="secondary" 
                              className="h-7 text-xs"
                              onClick={() => generateSigmaBridgeToken(connection.id)}
                              disabled={generatingBridgeToken === connection.id}
                            >
                              {generatingBridgeToken === connection.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                              Ativar Ponte
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold flex items-center gap-1">
                                <Monitor className="w-3 h-3" />
                                Configuração da Ponte
                              </span>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-6 text-[10px] text-destructive hover:bg-destructive/10"
                                onClick={() => revokeSigmaBridgeToken(connection.id)}
                              >
                                Revogar Chave
                              </Button>
                            </div>
                            
                            <div className="grid gap-2">
                              <p className="text-[10px] text-muted-foreground leading-tight">
                                Para contornar bloqueios de IP, arraste o botão abaixo para a barra de favoritos do navegador, abra o painel Sigma e clique no favorito.
                              </p>
                              
                              <div className="flex items-center gap-2">
                                <a
                                  href={getSigmaBridgeBookmarklet(connection.bridge_token)}
                                  onClick={(e) => e.preventDefault()}
                                  className="inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white shadow transition-colors hover:bg-violet-700 cursor-move"
                                  title="Arraste este botão para a barra de favoritos do seu navegador"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Ponte Sigma ({connection.name})
                                </a>
                                
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => copyToClipboard(getSigmaBridgeBookmarklet(connection.bridge_token), 'Bookmarklet')}
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Alert className="bg-muted/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Adicione quantas conexões precisar. Depois, selecione a conexão correta no cadastro de cada servidor Sigma.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Uniplay */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-emerald-500" />
            Uniplay (Painel)
            {hasUniplay && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Usuário e senha do painel Uniplay. As chamadas saem pelo proxy com IP residencial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="uniplay_username">Usuário</Label>
              <Input
                id="uniplay_username"
                value={settings.uniplay_username}
                onChange={(e) => setSettings({ ...settings, uniplay_username: e.target.value })}
                placeholder="Seu usuário do Uniplay"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uniplay_password">Senha</Label>
              <div className="relative">
                <Input
                  id="uniplay_password"
                  type={showUniplayPassword ? 'text' : 'password'}
                  value={settings.uniplay_password}
                  onChange={(e) => setSettings({ ...settings, uniplay_password: e.target.value })}
                  placeholder="Sua senha do Uniplay"
                  className="pr-10"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowUniplayPassword(!showUniplayPassword)}>
                  {showUniplayPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="uniplay_base_url">URL do painel (opcional)</Label>
              <Input
                id="uniplay_base_url"
                value={settings.uniplay_base_url}
                onChange={(e) => setSettings({ ...settings, uniplay_base_url: e.target.value })}
                placeholder="https://searchdefense.top"
              />
            </div>
          </div>
          <Button type="button" variant="outline" onClick={testUniplay} disabled={testingUniplay}>
            {testingUniplay && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Testar conexão Uniplay
          </Button>
        </CardContent>
      </Card>

      {/* kOffice Panel (P2Cine) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-pink-500" />
            kOffice Panel
            {(kofficeConnections.length > 0 || hasP2cine) && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          </CardTitle>
          <CardDescription>
            Adicione quantos painéis kOffice/P2Cine quiser. Informe apenas URL, usuário e chave de API —
            a renovação é feita direto pela API oficial do painel, sem navegador nem captcha.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="p2cine_base_url">URL do painel</Label>
              <Input
                id="p2cine_base_url"
                value={settings.p2cine_base_url}
                onChange={(e) => setSettings({ ...settings, p2cine_base_url: e.target.value })}
                placeholder="https://painelacesso1.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p2cine_username">Usuário</Label>
              <Input
                id="p2cine_username"
                value={settings.p2cine_username}
                onChange={(e) => setSettings({ ...settings, p2cine_username: e.target.value })}
                placeholder="Seu usuário do painel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p2cine_api_key">Chave de API</Label>
              <Input
                id="p2cine_api_key"
                type="password"
                value={settings.p2cine_api_key}
                onChange={(e) => setSettings({ ...settings, p2cine_api_key: e.target.value.trim() })}
                placeholder="Chave exibida no perfil do kOffice"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={testP2cine} disabled={testingP2cine || savingKofficeConnection}>
              {testingP2cine && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Testar conexão
            </Button>
            <Button type="button" onClick={addKofficeConnection} disabled={savingKofficeConnection}>
              {savingKofficeConnection ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Adicionar painel
            </Button>
          </div>

          {kofficeConnections.length > 0 && (
            <div className="space-y-2">
              <Label>Painéis kOffice conectados</Label>
              {kofficeConnections.map((connection) => (
                <div key={connection.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{connection.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{connection.username} • {connection.base_url}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeKofficeConnection(connection.id)} aria-label="Remover painel kOffice">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Alert className="bg-muted/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              O sistema identifica sozinho qual painel usar comparando a URL cadastrada aqui com o endereço
              do servidor do cliente — novos painéis passam a renovar automaticamente sem nenhum ajuste extra.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>



      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar APIs
        </Button>
      </div>
    </div>
  );
}
