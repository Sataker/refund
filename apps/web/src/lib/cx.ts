/**
 * Joins class names without merging conflicts. For landing client components only: `cn()` (tailwind-merge)
 * and the shadcn Button (cva + radix Slot) cost ~12 KB gzip in the landing bundle, whose budget is 150 KB
 * (ARCHITECTURE §11.1). Server components keep using `cn()`.
 */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
