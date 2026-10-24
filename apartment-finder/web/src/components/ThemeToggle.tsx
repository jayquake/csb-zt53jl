import * as React from 'react';
import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyTheme, loadTheme, type Theme } from '@/lib/theme';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const ICON: Record<Theme, React.ComponentType<{ className?: string }>> = {
  system: MonitorSmartphone,
  light: Sun,
  dark: Moon,
};
const LABEL: Record<Theme, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' };

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>('system');

  React.useEffect(() => {
    const saved = loadTheme();
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
  };

  const Icon = ICON[theme];

  return (
    <Button variant="ghost" size="sm" onClick={cycle} aria-label={`${LABEL[theme]} — tap to change`} title={LABEL[theme]}>
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}
