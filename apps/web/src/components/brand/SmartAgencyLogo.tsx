'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

type SmartAgencyLogoProps = {
  className?: string;
  /** Tam kelime + ikon; dar alanda yalnızca sol (A) kırpması */
  variant?: 'full' | 'markOnly';
  priority?: boolean;
};

const W = 1024;
const H = 682;

export function SmartAgencyLogo({
  className,
  variant = 'full',
  priority = false,
}: SmartAgencyLogoProps) {
  if (variant === 'markOnly') {
    return (
      <span
        className={cn(
          'relative block shrink-0 overflow-hidden rounded-xl bg-black h-9 w-9',
          className,
        )}
      >
        <Image
          src="/smartagency-logo.png"
          alt="SmartAgency"
          width={W}
          height={H}
          priority={priority}
          className="absolute left-0 top-0 h-full w-[260%] max-w-none object-cover object-left"
        />
      </span>
    );
  }

  return (
    <Image
      src="/smartagency-logo.png"
      alt="SmartAgency"
      width={W}
      height={H}
      priority={priority}
      className={cn('h-9 w-auto max-w-[200px] object-contain object-left', className)}
    />
  );
}
