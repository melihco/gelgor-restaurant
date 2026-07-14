'use client';

import type { ReactNode } from 'react';
import { SA_ONBOARDING } from './sa-chrome';

/** Shared backdrop for login + onboarding — matches SaChromeShell language. */
export function OnboardingChromeBackdrop({ success = false }: { success?: boolean }) {
  return (
    <>
      <div
        className={`onboarding-ambient${success ? ' onboarding-ambient--success' : ''}`}
        aria-hidden
      />
      <div className="onboarding-chrome-mark" aria-hidden />
      <div className="onboarding-chrome-hairline" aria-hidden />
    </>
  );
}

type StepState = 'idle' | 'active' | 'done';

export function OnboardingStepDot({ state }: { state: StepState }) {
  const bg =
    state === 'done'
      ? SA_ONBOARDING.doneBg
      : state === 'active'
        ? SA_ONBOARDING.activeBg
        : 'rgba(255,255,255,0.05)';
  const border =
    state === 'done'
      ? SA_ONBOARDING.doneBorder
      : state === 'active'
        ? SA_ONBOARDING.activeBorder
        : 'rgba(255,255,255,0.08)';

  return (
    <div
      style={{
        flexShrink: 0,
        width: 22,
        height: 22,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        border: `1px solid ${border}`,
        color: state === 'done' ? SA_ONBOARDING.done : 'rgba(255,255,255,0.3)',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {state === 'done' ? (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 13l4 4L19 7"
            stroke={SA_ONBOARDING.done}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : state === 'active' ? (
        <span className="onboarding-setup-spinner" />
      ) : null}
    </div>
  );
}

export function OnboardingStatusPill({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: SA_ONBOARDING.done,
          boxShadow: `0 0 10px ${SA_ONBOARDING.doneBg}`,
        }}
      />
      <span
        className="sa-chrome-eyebrow"
        style={{ margin: 0, color: SA_ONBOARDING.doneBright }}
      >
        {children}
      </span>
    </div>
  );
}

const PREVIEW_ICONS: Record<string, string> = {
  brand: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  content: 'M15.5 4.5 19.5 8.5 9 19l-4.5 1L5.5 15.5 15.5 4.5Z',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  info: 'M12 16v-4M12 8h.01M22 12c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2s10 4.48 10 10z',
  globe: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};

export function OnboardingPreviewIcon({
  name,
  color = SA_ONBOARDING.doneBright,
}: {
  name: keyof typeof PREVIEW_ICONS;
  color?: string;
}) {
  return (
    <div className="sa-chrome-icon-tile">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={PREVIEW_ICONS[name]} />
      </svg>
    </div>
  );
}

export function OnboardingSuccessMark({ icon = 'check' }: { icon?: 'check' | 'brand' }) {
  return (
    <div className="onboarding-success-ring" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        {icon === 'brand' ? (
          <path
            d={PREVIEW_ICONS.brand}
            stroke={SA_ONBOARDING.done}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          <path
            d="M5 13l4 4L19 7"
            stroke={SA_ONBOARDING.done}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}
