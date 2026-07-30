import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ListPlus, Pencil, Trash2, Plus, Send } from 'lucide-react';
import SendPlaylistDialog, { PlaylistTemplate } from './SendPlaylistDialog';

const EMPTY = {
  name: '',
  playlist_name: 'MINHA TV',
  m3u_url_template: '{{host}}/get.php?username={{usuario}}&password={{senha}}&type=m3u_plus&output=ts',
  epg_url_template: '',
  default_host: '',
  send_tv: true,
  send_vod: true,
  pin: '',
  is_default: false,
};

export default function PlaylistTemplatesCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editing, setEditing] = useState<PlaylistTemplate | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data: templates = [] } = useQuery({
    queryKey: ['playlist-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playlist_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as PlaylistTemplate[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Não autenticado');
      if (!form.name.trim()) throw new Error('Dê um nome ao modelo');
      if (!form.m3u_url_template.trim()) throw new Error('Informe a URL da lista');
      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        playlist_name: form.playlist_name.trim() || 'MINHA TV',
        m3u_url_template: form.m3u_url_template.trim(),
        epg_url_template: form.epg_url_template.trim() || null,
        default_host: form.default_host.trim() || null,
        send_tv: form.send_tv,
        send_vod: form.send_vod,
        pin: form.pin.trim() || null,
        is_default: form.is_default,
      };
      if (editing) {
        const { error } = await supabase.from('playlist_templates').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('playlist_templates').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist-templates'] });
      toast.success('Modelo salvo!');
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('playlist_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist-templates'] });
      toast.success('Modelo removido');
    },
  });

  const startEdit = (t: PlaylistTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      playlist_name: t.playlist_name,
      m3u_url_template: t.m3u_url_template,
      epg_url_template: t.epg_url_template || '',
      default_host: t.default_host || '',
      send_tv: t.send_tv,
      send_vod: t.send_vod,
      pin: t.pin || '',
      is_default: t.is_default,
    });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListPlus className="w-4 h-4" /> Envio de Lista para Apps
          </CardTitle>
          <CardDescription>
            Cada revendedor configura os seus próprios modelos. Use as variáveis{' '}
            <code className="text-[11px]">{'{{host}}'}</code>,{' '}
            <code className="text-[11px]">{'{{usuario}}'}</code>,{' '}
            <code className="text-[11px]">{'{{senha}}'}</code> e{' '}
            <code className="text-[11px]">{'{{email}}'}</code>.
          </CardDescription>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setSendOpen(true)}>
            <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Modelo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum modelo cadastrado ainda. Crie um para enviar listas em poucos cliques.
          </p>
        )}
        {templates.map((t) => (
          <div
            key={t.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{t.name}</span>
                {t.is_default && <Badge variant="secondary" className="text-[10px]">Padrão</Badge>}
                {t.send_tv && <Badge variant="outline" className="text-[10px]">TV</Badge>}
                {t.send_vod && <Badge variant="outline" className="text-[10px]">VOD</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground font-mono break-all mt-1">
                {t.m3u_url_template}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(t)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive"
                onClick={() => deleteMutation.mutate(t.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar modelo' : 'Novo modelo de lista'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome do modelo</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Servidor 1 - M3U Plus" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome exibido no app</Label>
              <Input value={form.playlist_name} onChange={(e) => setForm({ ...form, playlist_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Host padrão</Label>
              <Input value={form.default_host} onChange={(e) => setForm({ ...form, default_host: e.target.value })} placeholder="http://servidor.com" />
            </div>
            <div className="space-y-1.5">
              <Label>URL da lista (M3U)</Label>
              <Input value={form.m3u_url_template} onChange={(e) => setForm({ ...form, m3u_url_template: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label>URL do EPG (opcional)</Label>
              <Input value={form.epg_url_template} onChange={(e) => setForm({ ...form, epg_url_template: e.target.value })} className="font-mono text-xs" placeholder="Se vazio, usa a mesma URL da lista" />
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <Switch checked={form.send_tv} onCheckedChange={(v) => setForm({ ...form, send_tv: v })} />
                <Label className="text-sm">Canais (TV)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.send_vod} onCheckedChange={(v) => setForm({ ...form, send_vod: v })} />
                <Label className="text-sm">Filmes (VOD)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                <Label className="text-sm">Padrão</Label>
              </div>
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Salvar modelo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SendPlaylistDialog open={sendOpen} onOpenChange={setSendOpen} />
    </Card>
  );
}
