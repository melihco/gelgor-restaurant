import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CardProps = ComponentProps<'div'> & {
  children: ReactNode;
};

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('px-6 py-5', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('text-base font-medium leading-6 text-gray-800 dark:text-white/90', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-t border-gray-100 p-4 dark:border-gray-800 sm:p-6', className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-t border-gray-100 px-6 py-5 dark:border-gray-800', className)}
      {...props}
    />
  );
}
