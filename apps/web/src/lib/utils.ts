import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui class merger (origin: shadcn-ui/ui, MIT). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
