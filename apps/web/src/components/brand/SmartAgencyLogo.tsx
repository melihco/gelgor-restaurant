'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

type SmartAgencyLogoProps = {
  className?: string;
  /** Tam kelime + ikon; dar alanda yalnızca sol (A) kırpması */
  variant?: 'full' | 'markOnly';
  priority?: boolean;
};

const FULL_W = 525;
const FULL_H = 123;
const MARK_W = 200;
const MARK_H = 123;

export function SmartAgencyLogo({
  className,
  variant = 'full',
  priority = false,
}: SmartAgencyLogoProps) {
  if (variant === 'markOnly') {
    return (
      <Image
        src="/smartagency-mark.png"
        alt="SmartAgency"
        width={MARK_W}
        height={MARK_H}
        priority={priority}
        className={cn('h-9 w-auto object-contain', className)}
      />
    );
  }

  return (
    <Image
      src="/smartagency-logo.png"
      alt="SmartAgency"
      width={FULL_W}
      height={FULL_H}
      priority={priority}
      className={cn('h-9 w-auto max-w-[240px] object-contain', className)}
    />
  );
}
