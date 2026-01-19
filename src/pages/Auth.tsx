import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, User, Loader2, AlertCircle, Eye, EyeOff, Shield } from 'lucide-react';
import { z } from 'zod';
import logoSg from '@/assets/logo-sg.png';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  
  const { signIn, signUp, accessDeniedReason } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessDeniedMessage(null);
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      if (isLogin) {
        const result = await signIn(email, password);
        
        if (result.accessDenied) {
          setAccessDeniedMessage(result.accessDeniedMessage || 'Acesso negado');
          return;
        }
        
        if (result.error) {
          toast({
            title: 'Erro ao entrar',
            description: result.error.message === 'Invalid login credentials' 
              ? 'Email ou senha incorretos'
              : result.error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Bem-vindo!',
            description: 'Login realizado com sucesso.',
          });
          navigate('/');
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          toast({
            title: 'Erro ao criar conta',
            description: error.message.includes('already registered')
              ? 'Este email já está cadastrado'
              : error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Conta criada!',
            description: 'Você tem 7 dias de teste. Após isso, precisará de ativação.',
          });
          navigate('/');
        }
      }
    } finally {
      setLoading(false);
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
          <div className="mx-auto w-20 h-20 mb-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl blur-lg opacity-50" />
            <div className="relative w-full h-full bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/25">
              <Shield className="w-10 h-10 text-background" />
            </div>
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
            <Alert variant="destructive" className="mb-6 border-destructive/50 bg-destructive/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {accessDeniedMessage}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setErrors({});
                setAccessDeniedMessage(null);
              }}
              className="text-sm text-muted-foreground hover:text-amber-500 transition-colors"
            >
              {isLogin 
                ? 'Não tem conta? Criar agora'
                : 'Já tem conta? Entrar'}
            </button>
          </div>

          {!isLogin && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-xs text-amber-400 text-center">
                ⚡ Período de teste: 7 dias gratuitos. Após isso, entre em contato para ativação.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Ao continuar, você concorda com nossos termos de uso.
        </p>
      </div>
    </div>
  );
}
