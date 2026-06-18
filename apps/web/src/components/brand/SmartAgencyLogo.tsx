'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Icon-only (A mark) — dar alanlar, collapsed nav, favicon kaynak */
export const SMART_AGENCY_MARK_SRC = '/smartagency-mark.png';
/** Icon + SmartAgency wordmark — geniş header, splash, login */
export const SMART_AGENCY_FULL_SRC = '/smartagency-logo.png';

const MARK_W = 199;
const MARK_H = 123;
const FULL_W = 525;
const FULL_H = 123;

export type SmartAgencyLogoVariant = 'full' | 'mark' | 'auto';

type AutoBreakpoint = 'sm' | 'md' | 'lg' | 'xl';

type SmartAgencyLogoProps = {
  className?: string;
  /**
   * `full` — ikon + yazı
   * `mark` — yalnızca sol A ikonu
   * `auto` — dar ekranda mark, geniş ekranda full
   */
  variant?: SmartAgencyLogoVariant | 'markOnly';
  priority?: boolean;
  /** Siyah zeminli yuvarlak köşe çerçeve (admin chrome) */
  framed?: boolean;
  frameClassName?: string;
  /** `auto` için geçiş kırılımı — varsayılan lg */
  autoBreakpoint?: AutoBreakpoint;
};

const AUTO_MARK_HIDDEN: Record<AutoBreakpoint, string> = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
};

const AUTO_FULL_VISIBLE: Record<AutoBreakpoint, string> = {
  sm: 'sm:block',
  md: 'md:block',
  lg: 'lg:block',
  xl: 'xl:block',
};

function resolveVariant(variant: SmartAgencyLogoVariant | 'markOnly'): SmartAgencyLogoVariant {
  if (variant === 'markOnly') return 'mark';
  return variant;
}

function MarkImage({
  className,
  priority,
  decorative = false,
}: {
  className?: string;
  priority?: boolean;
  decorative?: boolean;
}) {
  return (
    <Image
      src={SMART_AGENCY_MARK_SRC}
      alt={decorative ? '' : 'SmartAgency'}
      aria-hidden={decorative}
      width={MARK_W}
      height={MARK_H}
      priority={priority}
      className={cn('h-9 w-auto object-contain object-left', className)}
    />
  );
}

function FullImage({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={SMART_AGENCY_FULL_SRC}
      alt="SmartAgency"
      width={FULL_W}
      height={FULL_H}
      priority={priority}
      className={cn('h-8 w-auto max-w-[min(240px,72vw)] object-contain object-left', className)}
    />
  );
}

export function SmartAgencyLogo({
  className,
  variant = 'full',
  priority = false,
  framed = false,
  frameClassName,
  autoBreakpoint = 'lg',
}: SmartAgencyLogoProps) {
  const resolved = resolveVariant(variant);

  const inner = (() => {
    if (resolved === 'mark') {
      return <MarkImage className={className} priority={priority} />;
    }
    if (resolved === 'full') {
      return <FullImage className={className} priority={priority} />;
    }
    const markHide = AUTO_MARK_HIDDEN[autoBreakpoint];
    const fullShow = AUTO_FULL_VISIBLE[autoBreakpoint];
    return (
      <>
        <MarkImage
          className={cn(markHide, className)}
          priority={priority}
          decorative
        />
        <FullImage
          className={cn('hidden', fullShow, className)}
          priority={priority}
        />
      </>
    );
  })();

  if (!framed) return inner;

  const isMarkOnly = resolved === 'mark';
  const isAuto = resolved === 'auto';
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl bg-black shadow-theme-md dark:ring-1 dark:ring-white/10',
        isMarkOnly && 'h-10 w-10 overflow-hidden px-1',
        !isMarkOnly && !isAuto && 'px-3 py-2',
        isAuto && 'h-10 w-10 overflow-hidden px-1 xl:overflow-visible xl:h-auto xl:w-auto xl:min-w-0 xl:px-3 xl:py-2',
        frameClassName,
      )}
    >
      {inner}
    </div>
  );
}
