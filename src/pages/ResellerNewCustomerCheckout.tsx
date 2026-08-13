import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Tv, ChevronRight, Check, ShieldCheck, User as UserIcon, Phone } from 'lucide-react';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export default function ResellerNewCustomerCheckout() {
  const { slug } = useParams<{ slug: string }>();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error('Preencha nome e telefone');
      return;
    }
    setLoading(true);
    try {
      // 1. Resolve reseller by slug
      const { data: resData, error: resError } = await supabase
        .from('profiles' as any)
        .select('user_id')
        .eq('checkout_code', slug)
        .maybeSingle();

      if (resError || !resData) {
        throw new Error('Revendedor não encontrado');
      }

      // 2. Insert into pending_new_customers
      const { error: insError } = await supabase
        .from('pending_new_customers' as any)
        .insert({
          name: name.trim(),
          phone: phone.trim().replace(/\D/g, ''),
          owner_id: (resData as any).user_id
        });

      if (insError) throw insError;

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
