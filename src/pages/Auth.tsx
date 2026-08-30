import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, User, Loader2, AlertCircle, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';
import { z } from 'zod';
import logoSg from '@/assets/logo-sg.png';
import { supabase } from '@/integrations/supabase/client';
import { fetchTurnstileConfig, getTurnstileToken, primeTurnstile, verifyTurnstile, type TurnstileConfig } from '@/lib/turnstile';



const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [refCode, setRefCode] = useState('');
  const [refReseller, setRefReseller] = useState<string | null>(null);
  const [refChecking, setRefChecking] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [turnstile, setTurnstile] = useState<TurnstileConfig>({ enabled: false, siteKey: null });
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'activation'>('login');
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTurnstileConfig().then(setTurnstile);
    supabase.functions
      .invoke('auth-security', { body: { action: 'config' } })
      .then(({ data }) => setTwoFactorEnabled(Boolean(data?.twoFactorEnabled)))
      .catch(() => setTwoFactorEnabled(false));
  }, []);

  // Valida um código de afiliação (digitado ou vindo do link ?ref=CODIGO)
  const resolveRefCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    setRefReseller(null);
    setRefError(null);
    if (!code) return;
    setRefChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('affiliate-signup', {
        body: { action: 'resolve', code },
      });
      if (error || data?.success === false) {
        setRefError(data?.error || 'Código de afiliação inválido');
        return;
      }
      setRefReseller(data?.reseller_name || 'Revendedor');
    } catch {
      setRefError('Não foi possível validar o código agora.');
    } finally {
      setRefChecking(false);
    }
  };

  // Link de afiliação: /auth?ref=CODIGO já abre o formulário de cadastro
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('ref') || params.get('codigo') || params.get('code') || '').trim().toUpperCase();
    if (!ref) return;
    setRefCode(ref);
    setIsLogin(false);
    resolveRefCode(ref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Widget visível desde o carregamento da página (não só após preencher o formulário).
  useEffect(() => {
    if (!turnstile.enabled || twoFactorStep) return;
    primeTurnstile(turnstile, isLogin ? 'login' : 'signup', turnstileContainerRef.current);
  }, [turnstile, isLogin, twoFactorStep]);



  
  const { signIn, signUp, accessDeniedReason } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const provisionCrmOficial = async (userId: string | undefined, options?: { silent?: boolean }) => {
    if (!userId) return false;
    try {
      const { data, error } = await supabase.functions.invoke('crm-oficial-sync', {
        body: { action: 'signup', data: { email, password, full_name: fullName || email.split('@')[0], local_user_id: userId } },
      });
      if (error) throw error;
      const apiKeyOk = data?.results?.api_key?.ok === true;
      const saved = data?.results?.api_key?.saved === true;
      if (!apiKeyOk || !saved) {
        const details = data?.results?.api_key?.body?.error || data?.results?.api_key?.save_error || data?.error || 'Não foi possível gerar a chave automática.';
        if (!options?.silent) {
          toast({ title: 'ZapCRM não conectou automaticamente', description: String(details), variant: 'destructive' });
        }
        return false;
      }
      if (!options?.silent) {
        toast({ title: 'ZapCRM conectado', description: 'Conta e chave de API criadas automaticamente.' });
      }
      return true;
    } catch (e: any) {
      if (!options?.silent) {
        toast({ title: 'ZapCRM não conectou automaticamente', description: e?.message || 'Tente novamente.', variant: 'destructive' });
      }
      return false;
    }
  };

  // Show access denied reason from context if exists
  useEffect(() => {
    if (accessDeniedReason) {
      setAccessDeniedMessage(accessDeniedReason);
    }
  }, [accessDeniedReason]);

  const validateForm = () => {
    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
      } else {
        signupSchema.parse({ email, password, fullName });
      }
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  // 2FA é opcional e definido por cada conta em Configurações → Segurança.
  const isTwoFactorRequiredForCurrentUser = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return false;
      const { data } = await supabase
        .from('platform_settings')
        .select('two_factor_enabled')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      return Boolean(data?.two_factor_enabled);
    } catch {
      return false;
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessDeniedMessage(null);
    
    if (!validateForm()) return;

    // Cloudflare Turnstile: ativado/desativado pelo painel admin e validado no servidor.
    if (turnstile.enabled) {
      try {
        const action = isLogin ? 'login' : 'signup';
        const token = await getTurnstileToken(turnstile, action, turnstileContainerRef.current);
        await verifyTurnstile(token, action);
      } catch (err: any) {
        toast({
          title: 'Verificação de segurança falhou',
          description: err?.message || 'Tente novamente.',
          variant: 'destructive',
        });
        return;
      }
    }

    setLoading(true);


    try {
      if (isLogin) {
        const result = await signIn(email, password);
        
        if (result.accessDenied) {
          setAccessDeniedMessage(result.accessDeniedMessage || 'Acesso negado');
          return;
        }
        
        if (result.error) {
          const msg = result.error.message || '';
          if (/not confirmed/i.test(msg)) {
            await supabase.functions.invoke('auth-security', {
              body: { action: 'send-code', email, purpose: 'activation' },
            });
            setOtpPurpose('activation');
            setOtpCode('');
            setTwoFactorStep(true);
            toast({
              title: 'Confirme seu e-mail',
              description: `Enviamos um código de ativação para ${email}.`,
            });
            return;
          }
          toast({
            title: 'Erro ao entrar',
            description: msg.includes('Invalid login credentials')
              ? 'Email ou senha incorretos. Verifique seus dados e tente novamente.'
              : msg.includes('Email not confirmed')
              ? 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.'
              : msg,
            variant: 'destructive',
          });
        } else if (await isTwoFactorRequiredForCurrentUser()) {
          // Senha validada: encerra a sessão e exige o código enviado por e-mail.
          await supabase.auth.signOut();
          const { data: sendData, error: sendError } = await supabase.functions.invoke('auth-security', {
            body: { action: 'send-code', email, purpose: 'login' },
          });
          if (sendError || sendData?.success === false) {
            toast({
              title: 'Não foi possível enviar o código',
              description: sendData?.error || 'Tente novamente em instantes.',
              variant: 'destructive',
            });
            return;
          }
          setOtpCode('');
          setOtpPurpose('login');
          setTwoFactorStep(true);
          toast({ title: 'Código enviado', description: `Enviamos um código de 6 dígitos para ${email}.` });
        } else {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          if (currentUser) {
            const { data: crmSettings } = await supabase
              .from('crm_oficial_settings')
              .select('api_key')
              .eq('user_id', currentUser.id)
              .maybeSingle();
            if (!crmSettings?.api_key) {
              await provisionCrmOficial(currentUser.id, { silent: true });
            }
          }
          toast({
            title: 'Bem-vindo!',
            description: 'Login realizado com sucesso.',
          });
          navigate('/dashboard');
        }
      } else {
        // Auto-cadastro só é permitido com o código/link de afiliação de um revendedor.
        const code = refCode.trim().toUpperCase();
        if (!code) {
          toast({
            title: 'Código obrigatório',
            description: 'Informe o código de cadastro do seu revendedor.',
            variant: 'destructive',
          });
          return;
        }
        const { data, error } = await supabase.functions.invoke('affiliate-signup', {
          body: { action: 'signup', code, full_name: fullName, email, password },
        });
        if (error || data?.success === false) {
          toast({
            title: 'Erro ao criar conta',
            description: data?.error || error?.message || 'Tente novamente.',
            variant: 'destructive',
          });
          return;
        }
        if (data?.requires_email_confirmation) {
          setOtpPurpose('activation');
          setOtpCode('');
          setTwoFactorStep(true);
          toast({
            title: 'Conta criada!',
            description: `Enviamos um código de ativação para ${email}.`,
          });
          return;
        }
        const result = await signIn(email, password);
        if (result.error) {
          toast({
            title: 'Conta criada!',
            description: 'Faça login com seu e-mail e senha.',
          });
          setIsLogin(true);
          return;
        }
        const { data: { user: newUser } } = await supabase.auth.getUser();
        await provisionCrmOficial(newUser?.id, { silent: true });
        toast({
          title: 'Conta criada!',
          description: `Você tem ${data?.trial_days ?? 7} dias de teste vinculado a ${data?.reseller_name || 'seu revendedor'}.`,
        });
        navigate('/dashboard');
      }

    } finally {
      setLoading(false);
    }
  };


  const finishLoginAfterCode = async () => {
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-security', {
        body: { action: 'verify-code', email, code: otpCode, purpose: otpPurpose },
      });
      if (error || data?.success === false) {
        toast({
          title: 'Código inválido',
          description: data?.error || 'Confira o código recebido por e-mail.',
          variant: 'destructive',
        });
        return;
      }
      const result = await signIn(email, password);
      if (result.accessDenied) {
        setTwoFactorStep(false);
        setAccessDeniedMessage(result.accessDeniedMessage || 'Acesso negado');
        return;
      }
      if (result.error) {
        toast({ title: 'Erro ao entrar', description: result.error.message, variant: 'destructive' });
        return;
      }
      setTwoFactorStep(false);
      toast({ title: 'Bem-vindo!', description: 'Login verificado com sucesso.' });
      navigate('/dashboard');
    } finally {
      setOtpLoading(false);
    }
  };

  const resendCode = async () => {
    setOtpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-security', {
        body: { action: 'send-code', email, purpose: otpPurpose },
      });
      if (error || data?.success === false) {
        toast({ title: 'Não foi possível reenviar', description: data?.error || 'Tente novamente.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Código reenviado', description: `Verifique a caixa de entrada de ${email}.` });
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background Logo - Transparent */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          backgroundImage: `url(${logoSg})`,
          backgroundSize: '60%',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.04,
        }}
      />
      
      {/* Gradient overlays */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-amber-500/5 via-transparent to-amber-600/5" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-600/10 rounded-full blur-3xl" />
      </div>

      {/* Main Content */}
      <div className="w-full max-w-md px-4 z-10">
        {/* Logo and Title */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="mx-auto w-36 h-36 sm:w-40 sm:h-40 mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400/50 to-amber-600/50 rounded-2xl blur-lg opacity-70" />
            <img
              src={logoSg}
              alt="Super Gestor"
              className="relative w-full h-full object-contain drop-shadow-[0_4px_20px_rgba(251,191,36,0.4)]"
            />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isLogin ? 'Bem-vindo de volta' : 'Criar sua conta'}
          </h1>
          <p className="text-muted-foreground">
            {isLogin 
              ? 'Acesse seu painel de gestão'
              : 'Comece seu período de teste de 7 dias'}
          </p>
        </div>

        {/* Form Card */}
        <div className="backdrop-blur-xl bg-card/80 border border-border/50 rounded-2xl p-8 shadow-2xl shadow-black/20 animate-fade-in">
          {accessDeniedMessage && (
            <>
              <Alert variant="destructive" className="mb-4 border-destructive/50 bg-destructive/10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {accessDeniedMessage}
                </AlertDescription>
              </Alert>
            </>
          )}

          {twoFactorStep ? (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <ShieldCheck className="w-8 h-8 text-amber-500 mx-auto" />
                <h2 className="text-lg font-semibold text-foreground">
                  {otpPurpose === 'activation' ? 'Ative sua conta' : 'Verificação em duas etapas'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Digite o código de 6 dígitos enviado para <span className="text-foreground">{email}</span>.
                </p>
              </div>
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="h-14 text-center text-2xl tracking-[0.5em] bg-secondary/50 border-border/50 rounded-xl"
              />
              <Button
                type="button"
                onClick={finishLoginAfterCode}
                disabled={otpLoading || otpCode.length !== 6}
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-background font-semibold rounded-xl"
              >
                {otpLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar código'}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button type="button" onClick={resendCode} disabled={otpLoading} className="text-amber-500 hover:underline">
                  Reenviar código
                </button>
                <button
                  type="button"
                  onClick={() => { setTwoFactorStep(false); setOtpCode(''); }}
                  className="text-muted-foreground hover:underline"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="refCode" className="text-foreground text-sm font-medium">
                  Código do revendedor
                </Label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    id="refCode"
                    placeholder="EX: A1B2C3D4"
                    value={refCode}
                    onChange={(e) => { setRefCode(e.target.value.toUpperCase()); setRefReseller(null); setRefError(null); }}
                    onBlur={(e) => resolveRefCode(e.target.value)}
                    className="pl-12 h-12 uppercase tracking-[0.2em] font-mono bg-secondary/50 border-border/50 rounded-xl"
                  />
                </div>
                {refChecking && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Validando código…
                  </p>
                )}
                {refReseller && !refChecking && (
                  <p className="text-xs text-emerald-500">Vinculado a {refReseller}</p>
                )}
                {refError && !refChecking && (
                  <p className="text-destructive text-sm flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {refError}
                  </p>
                )}
              </div>
            )}
            {!isLogin && (

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-foreground text-sm font-medium">
                  Nome Completo
                </Label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-amber-600/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-amber-500 transition-colors" />
                    <Input
                      id="fullName"
                      type="text"
                      placeholder="Seu nome completo"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-12 h-12 bg-secondary/50 border-border/50 rounded-xl focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
                    />
                  </div>
                </div>
                {errors.fullName && (
                  <p className="text-destructive text-sm flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.fullName}
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground text-sm font-medium">
                Email
              </Label>
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-amber-600/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-amber-500 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 h-12 bg-secondary/50 border-border/50 rounded-xl focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
                  />
                </div>
              </div>
              {errors.email && (
                <p className="text-destructive text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.email}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground text-sm font-medium">
                Senha
              </Label>
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-amber-600/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-amber-500 transition-colors" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 pr-12 h-12 bg-secondary/50 border-border/50 rounded-xl focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              {errors.password && (
                <p className="text-destructive text-sm flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.password}
                </p>
              )}
            </div>



            <Button 
              type="submit" 
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-background font-semibold rounded-xl shadow-lg shadow-amber-500/25 transition-all hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98]" 
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                'Entrar'
              ) : (
                'Criar Conta'
              )}
            </Button>
            {turnstile.enabled && (
              <div ref={turnstileContainerRef} className="flex min-h-1 justify-center" aria-label="Verificação Cloudflare Turnstile" />
            )}
          </form>
          )}

          {!twoFactorStep && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setErrors({}); }}
                className="text-sm text-amber-500 hover:underline"
              >
                {isLogin
                  ? 'Tem um código de revendedor? Criar minha conta'
                  : 'Já tenho conta — voltar para o login'}
              </button>
              {!isLogin && (
                <p className="mt-2 text-xs text-muted-foreground">
                  O cadastro só é liberado com o código ou link de afiliação de um revendedor.
                </p>
              )}
            </div>
          )}

        </div>
        
        {/* Footer */}
        {turnstile.enabled && (
          <p className="text-center text-[11px] text-muted-foreground mt-4 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            Protegido por Cloudflare Turnstile
          </p>
        )}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Ao continuar, você concorda com nossos termos de uso.
        </p>
      </div>
    </div>
  );
}
