import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, ChevronRight, Check, ShieldCheck, User as UserIcon, Phone, AtSign, Server } from 'lucide-react';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface ServerOption { id: string; name: string }

export default function ResellerNewCustomerCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [serverId, setServerId] = useState('');
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_BASE}/reseller-checkout-data?slug=${encodeURIComponent(slug || '')}`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        });
        const j = await res.json();
        if (Array.isArray(j?.servers)) setServers(j.servers);
      } catch {
        /* silencioso: servidor é opcional */
      }
    })();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !username.trim()) {
      toast.error('Preencha nome, WhatsApp e usuário desejado');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${FN_BASE}/reseller-checkout-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          action: 'register',
          slug,
          name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          username: username.trim(),
          server_id: serverId || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || 'Erro ao realizar cadastro');

      setSuccess(true);
      toast.success('Cadastro realizado! Agora escolha seu plano.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao realizar cadastro');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <Check className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Cadastro Concluído!</h1>
        <p className="text-white/60 mb-8 max-w-md">
          Seus dados foram recebidos. Clique no botão abaixo para escolher seu plano e realizar o pagamento.
        </p>
        <Link
          to={`/r/${slug}`}
          className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 transition-all"
        >
          ESCOLHER MEU PLANO <ChevronRight className="w-5 h-5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-20 bg-primary" />

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest bg-primary/10 text-primary border border-primary/20 mb-4">
            <ShieldCheck className="w-3.5 h-3.5" /> CHECKOUT SEGURO
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Novo <span className="text-primary">Assinante</span></h1>
          <p className="text-white/50">Crie sua conta em segundos para começar.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#161616] border border-white/5 p-8 rounded-2xl shadow-2xl space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-white/70 ml-1">NOME COMPLETO</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <Input
                placeholder="Ex: João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-black/20 border-white/10 pl-10 h-12 rounded-xl focus:ring-primary/50"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-white/70 ml-1">WHATSAPP COM DDD</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <Input
                placeholder="Ex: 11999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-black/20 border-white/10 pl-10 h-12 rounded-xl focus:ring-primary/50"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-white/70 ml-1">USUÁRIO DESEJADO</label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <Input
                placeholder="Ex: joao123"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                className="bg-black/20 border-white/10 pl-10 h-12 rounded-xl focus:ring-primary/50"
                required
              />
            </div>
            <p className="text-[11px] text-white/30 ml-1">Será o login usado no seu aplicativo.</p>
          </div>

          {servers.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/70 ml-1">SERVIDOR</label>
              <Select value={serverId} onValueChange={setServerId}>
                <SelectTrigger className="bg-black/20 border-white/10 h-12 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-white/30" />
                    <SelectValue placeholder="Selecione o servidor" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {servers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 text-lg font-bold rounded-xl shadow-[0_0_20px_-5px_var(--brand)] transition-all active:scale-[0.98]"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'CADASTRAR E CONTINUAR'}
          </Button>

          <p className="text-center text-[10px] text-white/30">
            Ao continuar, você concorda com nossos termos de uso e privacidade.
          </p>
        </form>

        <div className="flex justify-center">
          <Link to={`/r/${slug}`} className="text-white/40 hover:text-white text-sm transition-colors">
            Já sou cliente? Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
