import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "default"}
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={cn(
        "w-full justify-start gap-3 text-muted-foreground hover:text-foreground",
        collapsed && "lg:justify-center lg:px-2"
      )}
    >
      <div className="relative w-5 h-5">
        <Sun className="absolute inset-0 h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute inset-0 h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </div>
      {!collapsed && (
        <span className="text-sm font-medium">
          {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
        </span>
      )}
    </Button>
  );
}
