import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Palette, RotateCcw, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_THEME, PanelTheme, applyTheme, clearTheme, loadTheme, saveTheme } from '@/lib/panel-theme';

const PRESETS: Array<{ name: string; theme: PanelTheme }> = [
  { name: 'Laranja (padrão)', theme: { primary: '#e8590c', background: '#0a0a0a', accent: '#fde68a' } },
  { name: 'Verde', theme: { primary: '#10b981', background: '#0a0a0a', accent: '#a7f3d0' } },
  { name: 'Azul', theme: { primary: '#3b82f6', background: '#0a0f1e', accent: '#bfdbfe' } },
  { name: 'Roxo', theme: { primary: '#8b5cf6', background: '#0f0a1e', accent: '#ddd6fe' } },
  { name: 'Rosa', theme: { primary: '#ec4899', background: '#1a0a14', accent: '#fbcfe8' } },
  { name: 'Claro', theme: { primary: '#e8590c', background: '#f8f8f8', accent: '#fde68a' } },
];

export default function PanelThemeCard() {
  const { toast } = useToast();
  const [theme, setTheme] = useState<PanelTheme>(DEFAULT_THEME);

  useEffect(() => {
    const t = loadTheme();
    if (t) setTheme(t);
  }, []);

  const preview = (t: PanelTheme) => {
    setTheme(t);
    applyTheme(t);
  };

  const save = () => {
    saveTheme(theme);
    toast({ title: 'Cores salvas', description: 'Aparência do painel atualizada.' });
  };

  const reset = () => {
    clearTheme();
    setTheme(DEFAULT_THEME);
    toast({ title: 'Restaurado', description: 'Cores padrão restauradas. Recarregue a página se algo persistir.' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" /> Aparência do painel
        </CardTitle>
        <CardDescription>
          Personalize as cores do seu painel. Salvo localmente neste navegador.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid md:grid-cols-3 gap-4">
          {([
            ['primary', 'Cor primária'],
            ['background', 'Fundo'],
            ['accent', 'Destaque'],
          ] as const).map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label>{label}</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={theme[k]}
                  onChange={(e) => preview({ ...theme, [k]: e.target.value })}
                  className="w-16 p-1 cursor-pointer"
                />
                <Input
                  value={theme[k]}
                  onChange={(e) => preview({ ...theme, [k]: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Presets</Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => preview(p.theme)}
                className="px-3 py-2 rounded-lg border border-border/60 hover:border-primary/50 text-xs font-medium flex items-center gap-2 transition"
              >
                <span className="flex gap-0.5">
                  <span className="w-3 h-3 rounded-full" style={{ background: p.theme.primary }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: p.theme.background }} />
                  <span className="w-3 h-3 rounded-full" style={{ background: p.theme.accent }} />
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-border/40">
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="w-4 h-4 mr-2" /> Restaurar padrão
          </Button>
          <Button onClick={save}>
            <Save className="w-4 h-4 mr-2" /> Salvar cores
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
