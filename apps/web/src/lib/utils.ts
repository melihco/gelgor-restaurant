import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes; later wins, conflicts resolved like shadcn. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
