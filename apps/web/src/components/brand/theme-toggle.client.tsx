'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { cx } from '@/lib/cx';

const STORAGE_KEY = 'refund-theme';

function toggleTheme(): void {
  const root = document.documentElement;
  const dark = !root.classList.contains('dark');
  // Only colors change (no layout shift); transitions are paused for one frame so nothing flashes.
  root.classList.add('theme-switching');
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  try {
    window.localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    // Private mode or blocked storage: the switch still works for this page.
  }
  requestAnimationFrame(() => root.classList.remove('theme-switching'));
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Light/dark switch (IDENTITY-AND-UI §5.12 footer toggle; §6.1 item 4: shortcut `D` while presenting to the visitor).
 * The icon is chosen by CSS (`dark:`), so the server HTML never disagrees with theme-init.js.
 */
export function ThemeToggle({
  className,
  compact = false,
  shortcut = true,
}: {
  className?: string;
  /** Icon only (mobile top bars). */
  compact?: boolean;
  /** Owns the `D` shortcut. A page with two toggles (sidebar + mobile bar) gives it to one only. */
  shortcut?: boolean;
}) {
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'd' && e.key !== 'D') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      toggleTheme();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle"
      aria-label="Alternar tema claro e escuro (atalho D)"
      title="Alternar tema (D)"
      className={cx(
        'type-small inline-flex h-11 items-center gap-2 rounded-md border border-border bg-surface text-muted-foreground transition-colors duration-(--dur-fast) hover:border-strong-border hover:text-foreground',
        compact ? 'w-11 justify-center' : 'px-3',
        className,
      )}
    >
      <Moon className="size-4 dark:hidden" strokeWidth={1.5} aria-hidden="true" />
      <Sun className="hidden size-4 dark:block" strokeWidth={1.5} aria-hidden="true" />
      {compact ? null : (
        <>
          <span className="dark:hidden">Tema escuro</span>
          <span className="hidden dark:inline">Tema claro</span>
          <kbd className="type-caption ml-1 rounded-sm border border-border px-1 font-mono [@media(hover:none)]:hidden">
            D
          </kbd>
        </>
      )}
    </button>
  );
}
