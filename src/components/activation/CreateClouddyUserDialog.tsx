import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Copy, RefreshCw, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultEmail?: string;
  onCreated?: (data: { email: string; password: string }) => void;
}

const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

export default function CreateClouddyUserDialog({ open, onOpenChange, defaultEmail = '', onCreated }: Props) {
  const [email, setEmail] = useState(defaultEmail || randomDigits(8));
  const [password, setPassword] = useState(randomDigits(8));
  const [pin, setPin] = useState('0000');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ email: string; password: string; pin: string } | null>(null);

  const generate = () => {
    setEmail(randomDigits(8));
    setPassword(randomDigits(8));
    setResult(null);
  };

  const copyAll = (r: { email: string; password: string; pin: string }) => {
    navigator.clipboard.writeText(
      `📺 *ACESSO CLOUDDY*\n\n👤 Usuário: ${r.email}\n🔑 Senha: ${r.password}\n🔢 PIN: ${r.pin}`,
    );
    toast.success('Dados copiados!');
  };

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error('Usuário e senha são obrigatórios');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('clouddy-create-user', {
        body: { email: email.trim(), password: password.trim(), pin, notes },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const r = { email: (data as any).email, password: (data as any).password, pin: (data as any).pin };
      setResult(r);
      onCreated?.(r);
      toast.success('Usuário criado no Clouddy!');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao criar usuário');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Criar usuário Clouddy
          </DialogTitle>
          <DialogDescription>
            Cria a conta diretamente no painel Clouddy usando as credenciais salvas em Painéis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Usuário / E-mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="90715676" />
          </div>
          <div className="space-y-1.5">
            <Label>Senha</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="89289661" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>PIN</Label>
              <Input value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={generate} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-1" /> Gerar aleatório
            </Button>
            <Button className="flex-1" onClick={submit} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
              Criar
            </Button>
          </div>

          {result && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm space-y-1">
              <p><b>Usuário:</b> {result.email}</p>
              <p><b>Senha:</b> {result.password}</p>
              <p><b>PIN:</b> {result.pin}</p>
              <Button size="sm" variant="secondary" className="mt-1" onClick={() => copyAll(result)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copiar dados
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
