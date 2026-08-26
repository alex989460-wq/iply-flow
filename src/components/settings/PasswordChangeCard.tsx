import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function PasswordChangeCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const sendCode = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('change-password-verified', {
      body: { action: 'send-code' },
    });
    setLoading(false);
    if (error || !data?.success) {
      toast({
        title: 'Não foi possível enviar o código',
        description: data?.error || error?.message,
        variant: 'destructive',
      });
      return;
    }
    setStep('confirm');
    toast({ title: 'Código enviado', description: `Enviamos um código de 6 dígitos para ${user?.email}.` });
  };

  const confirm = async () => {
    if (newPassword.length < 8) {
      toast({ title: 'Senha muito curta', description: 'Use no mínimo 8 caracteres.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'As senhas não conferem', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('change-password-verified', {
      body: { action: 'confirm', code, newPassword },
    });
    setLoading(false);
    if (error || !data?.success) {
      toast({
        title: 'Não foi possível alterar a senha',
        description: data?.error || error?.message,
        variant: 'destructive',
      });
      return;
    }
    setStep('request');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    toast({ title: 'Senha alterada', description: 'Use a nova senha no próximo login.' });
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="w-5 h-5 text-primary" />
          Alterar minha senha
        </CardTitle>
        <CardDescription>
          Por segurança, enviamos um código de confirmação para o e-mail da sua conta antes de trocar a senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          E-mail da conta: <span className="font-mono">{user?.email}</span>
        </p>

        {step === 'request' ? (
          <Button onClick={sendCode} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
            Enviar código de confirmação
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Código recebido por e-mail</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="font-mono tracking-widest w-40"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">Nova senha</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Confirmar nova senha</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={confirm} disabled={loading || code.length !== 6} className="gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Alterar senha
              </Button>
              <Button variant="ghost" onClick={sendCode} disabled={loading}>
                Reenviar código
              </Button>
              <Button variant="ghost" onClick={() => setStep('request')} disabled={loading}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
