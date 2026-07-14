'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileStore } from './_components/mobile-store';
import { MobileThemeProvider, useTheme } from './_components/theme-context';
import { useAuthStore } from './_components/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { MobileNav } from './_components/MobileNav';
import { ProfileSheet } from './_components/ProfileSheet';
import { apiClient } from '@/lib/api-client';
import { getSessionToken } from '@/lib/session-token';
import { invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { BrandLoadingScreen } from './_components/BrandLoadingScreen';
import {
  getMobileArtifactsQueryOptions,
  MOBILE_ARTIFACT_MISSION_POOL_LIMIT,
} from './_lib/mobile-artifacts';

import {
  prefetchMobileScreen,
  LoginScreen,
  OnboardingFlow,
} from './_components/mobile-screen-loaders';
import { MobileArtifactsPoller } from './_components/MobileArtifactsPoller';
import { TenantBrandProvider } from './_components/TenantBrandProvider';
import { MobileScreenRouter } from './_components/MobileScreenRouter';

/* ─── Mobile-scoped CSS ──────────────────────────────────────────────
 * IMPORTANT: All rules MUST be scoped to .sa-mobile to avoid leaking
 * into the admin panel. Never target html/body/::webkit-scrollbar globally.
 * ─────────────────────────────────────────────────────────────────── */
const CSS = `
  /* Scoped wrapper — all mobile styles must live under .sa-mobile */
  .sa-mobile, .sa-mobile *,
  .sa-mobile *::before, .sa-mobile *::after {
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    box-sizing: border-box;
  }
  .sa-mobile {
    overscroll-behavior: none;
    -webkit-overflow-scrolling: touch;
  }
  .sa-mobile ::-webkit-scrollbar { display: none; }
  .sa-mobile button {
    -webkit-appearance: none; appearance: none;
    font-family: inherit; letter-spacing: inherit;
  }
  .sa-mobile button:active { opacity: 0.75; transform: scale(0.975); }
  .sa-mobile input, .sa-mobile textarea { font-family: inherit; }
  .sa-mobile input::placeholder, .sa-mobile textarea::placeholder {
    color: rgba(140,140,160,0.4);
  }

  /* ── Font settings (safe to apply globally) ── */
  :root {
    -webkit-text-size-adjust: 100%;
  }

  /* ── Keyframes ── */
  @keyframes liveGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.50); }
    50%      { box-shadow: 0 0 0 7px rgba(16,185,129,0); }
  }
  @keyframes violetGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(138,171,189,0.45); }
    50%      { box-shadow: 0 0 0 9px rgba(138,171,189,0); }
  }
  @keyframes goldGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.45); }
    50%      { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
  }
  @keyframes shimmer {
    0%,100% { opacity: 0.30; } 50% { opacity: 1; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleUp {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spinSlow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes breathe {
    0%,100% { transform: scale(1);    opacity: 0.55; }
    50%      { transform: scale(1.07); opacity: 1;   }
  }
  @keyframes fabPulse {
    0%,100% { box-shadow: 0 4px 20px rgba(138,171,189,0.4); }
    50%      { box-shadow: 0 4px 28px rgba(138,171,189,0.65), 0 0 0 6px rgba(138,171,189,0.12); }
  }
  @keyframes cardEnter {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes storyProgress {
    from { width: 0%; }
    to   { width: 100%; }
  }
  @keyframes marquee {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes navPop {
    0%   { opacity: 0; transform: translateY(12px) scale(0.95); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes splashLogoIn {
    from { opacity: 0; transform: scale(0.9) translateY(10px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes laserHaloOrbit {
    0%   { transform: rotateX(68deg) rotateZ(0deg) scale(0.995); opacity: 0.34; }
    50%  { transform: rotateX(68deg) rotateZ(180deg) scale(1.022); opacity: 0.48; }
    100% { transform: rotateX(68deg) rotateZ(360deg) scale(0.995); opacity: 0.34; }
  }
  @keyframes laserScanMove {
    0%   { left: -20%; opacity: 0; }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { left: 120%; opacity: 0; }
  }
  @keyframes laserScanDot {
    0%, 100% { opacity: 0.2; transform: scale(0.6); }
    50%      { opacity: 1; transform: scale(1.2); }
  }
  @keyframes laserGridPulse {
    0%, 100% { opacity: 0.18; }
    50%      { opacity: 0.3; }
  }
  @keyframes laserCoreFloat {
    0%, 100% { transform: translateY(0) scale(1); }
    50%      { transform: translateY(-3px) scale(1.012); }
  }

  .sa-mobile .splash-logo { animation: splashLogoIn 520ms cubic-bezier(0.34,1.2,0.64,1) both; }

  /* ── 3D Laser / Drone Show ── */
  .sa-mobile .brand-laser-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    perspective: 900px;
  }
  .sa-mobile .brand-laser-stage--md { width: min(390px, 94vw); height: min(360px, 86vw); }
  .sa-mobile .brand-laser-stage--onboarding { width: min(220px, 58vw); height: min(200px, 52vw); margin: 0 auto -12px; }
  .sa-mobile .brand-laser-stage--sm { width: min(285px, 84vw); height: min(250px, 74vw); }
  .sa-mobile .brand-laser-stage--lg { width: min(450px, 96vw); height: min(410px, 90vw); }

  .sa-mobile .brand-laser-perspective {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sa-mobile .brand-laser-grid {
    position: absolute;
    width: 140%;
    height: 55%;
    bottom: -8%;
    left: -20%;
    background:
      linear-gradient(rgba(77,112,136,0.12) 1px, transparent 1px),
      linear-gradient(90deg, rgba(77,112,136,0.12) 1px, transparent 1px);
    background-size: 28px 28px;
    transform: rotateX(68deg);
    transform-origin: center bottom;
    mask-image: radial-gradient(ellipse 70% 80% at 50% 100%, #000 20%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse 70% 80% at 50% 100%, #000 20%, transparent 75%);
    opacity: 0.28;
    animation: laserGridPulse 7.5s ease-in-out infinite;
    pointer-events: none;
  }

  .sa-mobile .brand-laser-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid transparent;
    pointer-events: none;
    top: 50%;
    left: 50%;
    transform-style: preserve-3d;
    box-shadow: 0 0 18px rgba(157,190,206,0.12);
    filter: blur(0.15px);
  }
  .sa-mobile .brand-laser-ring--halo-1 {
    width: 122%;
    height: 70%;
    margin-left: -61%;
    margin-top: -35%;
    border-color: rgba(157,190,206,0.2);
    border-top-color: rgba(34,211,238,0.3);
    border-bottom-color: rgba(77,112,136,0.14);
    box-shadow:
      0 0 28px rgba(157,190,206,0.12),
      inset 0 0 18px rgba(255,255,255,0.02);
    animation: laserHaloOrbit 12.5s ease-in-out infinite;
  }
  .sa-mobile .brand-laser-ring--halo-2 {
    width: 102%;
    height: 58%;
    margin-left: -51%;
    margin-top: -29%;
    border-color: rgba(176,196,212,0.12);
    border-top-color: rgba(255,255,255,0.16);
    border-bottom-color: rgba(34,211,238,0.1);
    box-shadow:
      0 0 20px rgba(176,196,212,0.08),
      inset 0 0 14px rgba(255,255,255,0.015);
    animation: laserHaloOrbit 12.5s ease-in-out infinite;
    animation-delay: -6.25s;
  }

  .sa-mobile .brand-laser-core {
    position: relative;
    z-index: 5;
    animation: laserCoreFloat 5.8s ease-in-out infinite, splashLogoIn 700ms cubic-bezier(0.22,1,0.36,1) both;
  }

  .sa-mobile .brand-loader-breathe {
    animation: brandLoaderBreathe 2.8s ease-in-out infinite;
  }
  @keyframes brandLoaderBreathe {
    0%, 100% { opacity: 0.9; transform: scale(0.988); }
    50% { opacity: 1; transform: scale(1); }
  }

  .sa-mobile .brand-loader-logo {
    width: min(280px, 72vw);
    max-width: 280px;
    height: auto !important;
    filter: drop-shadow(0 8px 24px rgba(0,0,0,0.18));
  }
  .sa-mobile .brand-loader-logo--sm {
    width: auto;
    max-width: none;
    filter: drop-shadow(0 6px 18px rgba(0,0,0,0.14));
  }

  .sa-mobile .brand-grouped-fields > *:not(:last-child) {
    border-bottom: 0.5px solid rgba(255,255,255,0.05);
  }
  .sa-mobile[data-theme="light"] .brand-grouped-fields > *:not(:last-child) {
    border-bottom: 0.5px solid rgba(0,0,0,0.06);
  }

  /* Scan bar under logo */
  .sa-mobile .brand-laser-scan {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(200px, 55vw);
  }
  .sa-mobile .brand-laser-scan--sm { width: min(140px, 45vw); gap: 8px; }
  .sa-mobile .brand-laser-scan-track {
    position: relative;
    width: 100%;
    height: 2px;
    border-radius: 2px;
    background: rgba(77,112,136,0.14);
    overflow: hidden;
  }
  .sa-mobile .brand-laser-scan-head {
    position: absolute;
    top: -1px;
    width: 28%;
    height: 4px;
    border-radius: 4px;
    background: linear-gradient(90deg, transparent, #22D3EE, #9DBECE, #fff, #9DBECE, transparent);
    box-shadow: 0 0 12px rgba(34,211,238,0.8), 0 0 24px rgba(157,190,206,0.5);
    animation: laserScanMove 2.4s ease-in-out infinite;
  }
  .sa-mobile .brand-laser-scan-dots {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  .sa-mobile .brand-laser-scan-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: linear-gradient(145deg, #E8E8F0, #9DBECE);
    box-shadow: 0 0 8px rgba(157,190,206,0.5);
    animation: laserScanDot 1.6s ease-in-out infinite;
    animation-delay: calc(var(--scan-i) * 0.12s);
  }
  .sa-mobile .brand-laser-scan--sm .brand-laser-scan-dot { width: 4px; height: 4px; }

  /* ── Onboarding — editorial / studio welcome ── */
  .sa-mobile .onboarding-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    height: 100dvh;
    overflow: hidden;
    background: #0A0A0E;
    font-family: -apple-system, "SF Pro Display", system-ui, sans-serif;
    color: #F2F2F6;
  }
  .sa-mobile .onboarding-ambient {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 90% 55% at 50% -5%, rgba(77,112,136,0.14) 0%, transparent 58%),
      radial-gradient(ellipse 60% 40% at 100% 100%, rgba(201,169,110,0.06) 0%, transparent 55%);
    pointer-events: none;
  }
  .sa-mobile .onboarding-header {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    padding:
      calc(env(safe-area-inset-top, 0px) + 28px)
      28px
      20px;
    text-align: center;
  }
  .sa-mobile .onboarding-logo {
    display: block;
    margin: 0 auto 28px;
    width: min(248px, 78vw);
    height: auto !important;
    max-width: none;
    object-fit: contain;
    filter: drop-shadow(0 4px 24px rgba(0,0,0,0.35));
  }
  .sa-mobile .login-logo {
    display: block;
    margin: 0 auto;
    width: min(220px, 68vw);
    height: auto !important;
    object-fit: contain;
    filter: drop-shadow(0 4px 16px rgba(0,0,0,0.22));
  }
  .sa-mobile .onboarding-shell--login {
    justify-content: center;
  }
  .sa-mobile .onboarding-shell--login .onboarding-fields {
    flex: 0 0 auto;
    gap: 12px;
  }
  .sa-mobile .onboarding-auth-form {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
  }
  .sa-mobile .onboarding-shell--login .onboarding-login-main {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    justify-content: center;
    align-items: center;
    padding:
      calc(env(safe-area-inset-top, 0px) + 16px)
      max(24px, calc(env(safe-area-inset-right, 0px) + 24px))
      16px
      max(24px, calc(env(safe-area-inset-left, 0px) + 24px));
  }
  .sa-mobile .login-content {
    width: 100%;
    max-width: 320px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .sa-mobile .login-hero {
    text-align: center;
    margin-bottom: 28px;
  }
  .sa-mobile .login-form {
    width: 100%;
  }
  .sa-mobile .onboarding-actions--login {
    margin-top: 16px;
    padding-top: 0;
    flex-shrink: 0;
  }
  .sa-mobile .onboarding-footer--login {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding-left: max(20px, calc(env(safe-area-inset-left, 0px) + 20px));
    padding-right: max(20px, calc(env(safe-area-inset-right, 0px) + 20px));
    padding-bottom: max(20px, env(safe-area-inset-bottom, 0px));
  }
  @media (max-height: 700px) {
    .sa-mobile .login-hero {
      margin-bottom: 20px;
    }
    .sa-mobile .login-logo {
      width: min(188px, 58vw);
    }
  }
  .sa-mobile .auth-password-wrap {
    position: relative;
  }
  .sa-mobile .auth-password-input {
    padding-right: 48px;
  }
  .sa-mobile .auth-password-toggle {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: rgba(148,163,184,0.45);
    cursor: pointer;
    transition: color 160ms ease;
  }
  .sa-mobile .auth-password-toggle:active {
    color: rgba(184,205,216,0.85);
  }
  .sa-mobile .auth-legal-note {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.02em;
    color: rgba(148,163,184,0.28);
  }
  .sa-mobile .onboarding-title {
    margin: 0 0 10px;
    font-size: clamp(28px, 7vw, 34px);
    font-weight: 700;
    letter-spacing: -0.035em;
    line-height: 1.12;
    color: #F4F4F8;
  }
  .sa-mobile .onboarding-lead {
    margin: 0 auto;
    max-width: 320px;
    font-size: 15px;
    line-height: 1.55;
    font-weight: 400;
    color: rgba(160,160,180,0.72);
  }
  .sa-mobile .onboarding-main {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0 28px;
    overflow-y: auto;
  }
  .sa-mobile .onboarding-segment {
    display: flex;
    gap: 0;
    margin-bottom: 22px;
    border-radius: 12px;
    padding: 3px;
    background: rgba(255,255,255,0.05);
    border: 0.5px solid rgba(255,255,255,0.08);
  }
  .sa-mobile .onboarding-segment-btn {
    flex: 1;
    padding: 11px 12px;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: rgba(148,163,184,0.55);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: background 180ms ease, color 180ms ease;
  }
  .sa-mobile .onboarding-segment-btn--on {
    background: rgba(255,255,255,0.1);
    color: #F4F4F8;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .sa-mobile .onboarding-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }
  .sa-mobile .onboarding-field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .sa-mobile .onboarding-field-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(160,160,180,0.55);
  }
  .sa-mobile .onboarding-field-label--muted {
    color: rgba(160,160,180,0.38);
  }
  .sa-mobile .onboarding-input {
    width: 100%;
    box-sizing: border-box;
    min-height: 48px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 0.5px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: #F4F4F8;
    font-size: 16px;
    letter-spacing: -0.01em;
    outline: none;
    transition: border-color 160ms ease, background 160ms ease;
    color-scheme: dark;
  }
  .sa-mobile .onboarding-input:-webkit-autofill,
  .sa-mobile .onboarding-input:-webkit-autofill:hover,
  .sa-mobile .onboarding-input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px #12161e inset;
    -webkit-text-fill-color: #F4F4F8;
    caret-color: #F4F4F8;
    border: 0.5px solid rgba(77,112,136,0.45);
  }
  .sa-mobile .onboarding-input::placeholder {
    color: rgba(148,163,184,0.35);
  }
  .sa-mobile .onboarding-input:focus {
    border-color: rgba(138,171,189,0.45);
    background: rgba(255,255,255,0.06);
  }
  .sa-mobile .onboarding-input--filled {
    border-color: rgba(77,112,136,0.35);
  }
  .sa-mobile .onboarding-input--error {
    border-color: rgba(239,68,68,0.45);
  }
  .sa-mobile .onboarding-error {
    margin: 4px 0 0;
    font-size: 13px;
    color: #F87171;
    font-weight: 500;
  }
  .sa-mobile .onboarding-actions {
    margin-top: auto;
    padding-top: 28px;
    flex-shrink: 0;
  }
  .sa-mobile .onboarding-cta {
    width: 100%;
    min-height: 48px;
    padding: 14px 16px;
    border: none;
    border-radius: 14px;
    background: linear-gradient(135deg, #4D7088, #5A82A0);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: -0.02em;
    cursor: pointer;
    box-shadow: 0 6px 28px rgba(77,112,136,0.4);
    transition: background 160ms ease, transform 100ms ease, box-shadow 160ms ease;
  }
  .sa-mobile .onboarding-cta:active {
    transform: scale(0.99);
    background: #456678;
  }
  .sa-mobile .onboarding-note {
    margin: 0 0 8px;
    text-align: center;
    font-size: 12px;
    color: rgba(148,163,184,0.38);
  }
  .sa-mobile .onboarding-footer {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    padding: 12px 28px max(24px, env(safe-area-inset-bottom));
    text-align: center;
  }
  .sa-mobile .onboarding-login-link {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 14px;
    color: rgba(148,163,184,0.45);
    padding: 8px;
  }
  .sa-mobile .onboarding-login-link span {
    color: #8AABBD;
    font-weight: 600;
  }
  .sa-mobile .onboarding-header--compact {
    padding:
      calc(env(safe-area-inset-top, 0px) + 18px)
      28px
      8px;
  }
  .sa-mobile .onboarding-logo--compact {
    width: min(196px, 68vw);
    margin-left: auto;
    margin-right: auto;
    margin-bottom: 16px;
  }
  .sa-mobile .onboarding-title--step {
    margin: 0 0 8px;
    font-size: clamp(24px, 6vw, 28px);
    text-align: left;
  }
  .sa-mobile .onboarding-lead--step {
    margin: 0 0 24px;
    max-width: none;
    text-align: left;
    font-size: 14px;
  }
  .sa-mobile .onboarding-signup-main {
    justify-content: flex-start;
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }
  .sa-mobile .onboarding-cta--loading {
    background: rgba(255,255,255,0.08) !important;
    box-shadow: none !important;
    cursor: not-allowed;
  }
  .sa-mobile .onboarding-status {
    margin: 14px 0 0;
    text-align: center;
    font-size: 12px;
    line-height: 1.55;
    color: rgba(148,163,184,0.58);
  }

  /* ── Onboarding — premium account-setup splash ── */
  .sa-mobile .onboarding-setup {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 12px 28px max(28px, env(safe-area-inset-bottom));
    text-align: center;
    overflow-y: auto;
  }
  .sa-mobile .onboarding-setup-ringwrap {
    position: relative;
    width: 132px;
    height: 132px;
    margin: 6px 0 22px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sa-mobile .onboarding-setup-shimmer {
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0%, rgba(157,190,206,0.22) 16%, transparent 34%);
    animation: spinSlow 2.8s linear infinite;
    filter: blur(6px);
  }
  .sa-mobile .onboarding-setup-ringcenter {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .sa-mobile .onboarding-setup-pct {
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.045em;
    line-height: 1;
    color: #EAF1F6;
    font-variant-numeric: tabular-nums;
  }
  .sa-mobile .onboarding-setup-pct span {
    font-size: 16px;
    color: rgba(157,190,206,0.7);
    margin-left: 1px;
  }
  .sa-mobile .onboarding-setup-pctlabel {
    margin-top: 4px;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(148,163,184,0.5);
  }
  .sa-mobile .onboarding-setup-brand {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #F4F4F8;
    margin-bottom: 4px;
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sa-mobile .onboarding-setup-sub {
    font-size: 13px;
    color: rgba(160,160,180,0.6);
    margin-bottom: 28px;
  }
  .sa-mobile .onboarding-setup-steps {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    margin-bottom: 22px;
  }
  .sa-mobile .onboarding-setup-step {
    display: flex;
    gap: 13px;
    align-items: center;
    padding: 9px 4px;
    opacity: 0.4;
    transition: opacity 320ms ease;
  }
  .sa-mobile .onboarding-setup-step.is-done { opacity: 0.92; }
  .sa-mobile .onboarding-setup-step.is-active { opacity: 1; }
  .sa-mobile .onboarding-setup-step-dot {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.3);
  }
  .sa-mobile .onboarding-setup-step.is-done .onboarding-setup-step-dot {
    background: rgba(52,211,153,0.15);
    border-color: rgba(52,211,153,0.4);
    color: #34D399;
  }
  .sa-mobile .onboarding-setup-step.is-active .onboarding-setup-step-dot {
    background: rgba(77,112,136,0.16);
    border-color: rgba(90,130,160,0.5);
  }
  .sa-mobile .onboarding-setup-spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid rgba(157,190,206,0.25);
    border-top-color: #9DBECE;
    animation: spinSlow 0.75s linear infinite;
  }
  .sa-mobile .onboarding-setup-step-label {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: rgba(148,163,184,0.55);
  }
  .sa-mobile .onboarding-setup-step.is-done .onboarding-setup-step-label { color: #E6E9F0; }
  .sa-mobile .onboarding-setup-step.is-active .onboarding-setup-step-label { color: #F4F4F8; }
  .sa-mobile .onboarding-setup-step-detail {
    font-size: 12px;
    color: rgba(148,163,184,0.5);
    line-height: 1.4;
    margin-top: 2px;
  }
  .sa-mobile .onboarding-setup-status {
    width: 100%;
    max-width: 360px;
    box-sizing: border-box;
    font-size: 12.5px;
    line-height: 1.5;
    font-weight: 500;
    color: rgba(157,190,206,0.82);
    padding: 11px 14px;
    border-radius: 12px;
    background: rgba(77,112,136,0.1);
    border: 0.5px solid rgba(77,112,136,0.22);
    margin-bottom: 10px;
  }
  .sa-mobile .onboarding-setup-hint {
    font-size: 11.5px;
    color: rgba(148,163,184,0.45);
    line-height: 1.5;
    max-width: 320px;
  }
  .sa-mobile .onboarding-shell--welcome {
    text-align: center;
  }
  .sa-mobile .onboarding-ambient--success {
    background:
      radial-gradient(ellipse 85% 50% at 50% -8%, rgba(77,112,136,0.18) 0%, transparent 58%),
      radial-gradient(ellipse 55% 38% at 50% 18%, rgba(52,211,153,0.12) 0%, transparent 62%);
  }
  .sa-mobile .onboarding-welcome-body {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 8px 24px max(28px, env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  .sa-mobile .onboarding-success-ring {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: 700;
    color: #34D399;
    background: linear-gradient(180deg, rgba(52,211,153,0.14), rgba(52,211,153,0.07));
    border: 1px solid rgba(52,211,153,0.35);
    box-shadow: 0 0 40px rgba(52,211,153,0.22);
  }
  .sa-mobile .onboarding-brand-card {
    width: 100%;
    max-width: 360px;
    margin-bottom: 20px;
    padding: 16px 14px;
    border-radius: 20px;
    background: rgba(255,255,255,0.045);
    border: 0.5px solid rgba(255,255,255,0.12);
    backdrop-filter: blur(10px);
    text-align: left;
  }
  .sa-mobile .onboarding-brand-card-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .sa-mobile .onboarding-brand-avatar {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 800;
    color: #C4B5FD;
    background: linear-gradient(135deg, rgba(77,112,136,0.25), rgba(90,130,160,0.22));
    border: 0.5px solid rgba(157,190,206,0.35);
  }
  .sa-mobile .onboarding-brand-meta-title {
    font-size: 15px;
    font-weight: 700;
    color: #F4F4F8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sa-mobile .onboarding-brand-meta-sub {
    margin-top: 2px;
    font-size: 12px;
    color: rgba(148,163,184,0.58);
  }
  .sa-mobile .onboarding-feature-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .sa-mobile .onboarding-feature-chip {
    padding: 8px 10px;
    border-radius: 12px;
    font-size: 12px;
    color: rgba(226,232,240,0.72);
    background: rgba(255,255,255,0.035);
    border: 0.5px solid rgba(255,255,255,0.08);
  }
  .sa-mobile .onboarding-analyze-head {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    padding:
      calc(env(safe-area-inset-top, 0px) + 12px)
      28px
      0;
    text-align: center;
  }
  .sa-mobile .onboarding-results-head {
    position: relative;
    z-index: 1;
    flex-shrink: 0;
    padding:
      calc(env(safe-area-inset-top, 0px) + 12px)
      24px
      16px;
  }

  /* ── Feed loading skeleton (Instagram layout) ── */
  .sa-mobile .feed-skel {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: #000;
    padding-bottom: 24px;
  }
  .sa-mobile .feed-skel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 10px;
    border-bottom: 0.5px solid rgba(255,255,255,0.08);
    background: rgba(0,0,0,0.96);
  }
  .sa-mobile .feed-skel-header-spacer { width: 40px; }
  .sa-mobile .feed-skel-header-logo {
    font-family: 'Billabong', 'Brush Script MT', 'Segoe Script', cursive;
    font-size: 36px;
    line-height: 1;
    color: #fff;
  }
  .sa-mobile .feed-skel-header-icons {
    display: flex;
    gap: 16px;
    width: 52px;
    justify-content: flex-end;
  }
  .sa-mobile .feed-skel-icon {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: rgba(255,255,255,0.08);
  }
  .sa-mobile .feed-skel-shimmer {
    background: linear-gradient(
      90deg,
      rgba(255,255,255,0.06) 0%,
      rgba(255,255,255,0.16) 45%,
      rgba(255,255,255,0.06) 100%
    );
    background-size: 200% 100%;
    animation: shimmerSlide 1.6s ease-in-out infinite;
  }
  .sa-mobile .feed-skel-stories {
    display: flex;
    gap: 14px;
    padding: 14px 16px;
    overflow: hidden;
    border-bottom: 0.5px solid rgba(255,255,255,0.08);
  }
  .sa-mobile .feed-skel-story {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 68px;
  }
  .sa-mobile .feed-skel-story-ring {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    padding: 2.5px;
    background: linear-gradient(135deg, rgba(77,112,136,0.5), rgba(201,169,110,0.35));
  }
  .sa-mobile .feed-skel-story-avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid #000;
  }
  .sa-mobile .feed-skel-story-label {
    width: 48px;
    height: 8px;
    border-radius: 4px;
  }
  .sa-mobile .feed-skel-post {
    border-bottom: 0.5px solid rgba(255,255,255,0.08);
    margin-bottom: 2px;
  }
  .sa-mobile .feed-skel-post-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
  }
  .sa-mobile .feed-skel-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .sa-mobile .feed-skel-post-meta { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .sa-mobile .feed-skel-line {
    height: 10px;
    border-radius: 5px;
  }
  .sa-mobile .feed-skel-line--sm { width: 42%; height: 8px; }
  .sa-mobile .feed-skel-line--md { width: 58%; }
  .sa-mobile .feed-skel-line--lg { width: 88%; }
  .sa-mobile .feed-skel-media {
    width: 100%;
    aspect-ratio: 4 / 5;
    background-color: rgba(255,255,255,0.07);
  }
  .sa-mobile .feed-skel-actions {
    display: flex;
    gap: 12px;
    padding: 12px 14px 8px;
  }
  .sa-mobile .feed-skel-action {
    width: 22px;
    height: 22px;
    border-radius: 6px;
  }
  .sa-mobile .feed-skel-caption {
    padding: 0 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sa-mobile .feed-skel-message {
    margin: 16px 0 8px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.55);
    letter-spacing: 0.01em;
  }

  .sa-mobile-frame[data-theme="light"] .feed-skel,
  .sa-mobile[data-theme="light"] .feed-skel {
    background: #F4F6F8;
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-header,
  .sa-mobile[data-theme="light"] .feed-skel-header {
    background: rgba(255,255,255,0.96);
    border-bottom-color: rgba(0,0,0,0.08);
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-icon,
  .sa-mobile[data-theme="light"] .feed-skel-icon {
    background: rgba(0,0,0,0.07);
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-shimmer,
  .sa-mobile[data-theme="light"] .feed-skel-shimmer {
    background: linear-gradient(
      90deg,
      rgba(0,0,0,0.05) 0%,
      rgba(0,0,0,0.10) 45%,
      rgba(0,0,0,0.05) 100%
    );
    background-size: 200% 100%;
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-stories,
  .sa-mobile[data-theme="light"] .feed-skel-stories {
    border-bottom-color: rgba(0,0,0,0.08);
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-story-avatar,
  .sa-mobile[data-theme="light"] .feed-skel-story-avatar {
    border-color: #F4F6F8;
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-post,
  .sa-mobile[data-theme="light"] .feed-skel-post {
    border-bottom-color: rgba(0,0,0,0.08);
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-media,
  .sa-mobile[data-theme="light"] .feed-skel-media {
    background-color: rgba(0,0,0,0.06);
  }
  .sa-mobile-frame[data-theme="light"] .feed-skel-message,
  .sa-mobile[data-theme="light"] .feed-skel-message {
    color: rgba(8,12,16,0.55);
  }
  .sa-mobile-frame[data-theme="light"] .feed-empty-title,
  .sa-mobile[data-theme="light"] .feed-empty-title {
    color: #080C10;
  }
  .sa-mobile-frame[data-theme="light"] .feed-empty-body,
  .sa-mobile[data-theme="light"] .feed-empty-body {
    color: rgba(8,12,16,0.55);
  }
  .sa-mobile-frame[data-theme="light"] .ig-feed-media-stage,
  .sa-mobile[data-theme="light"] .ig-feed-media-stage {
    background: #f4f4f4;
  }

  .sa-mobile .feed-empty {
    min-height: 42vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 28px 48px;
    text-align: center;
  }
  .sa-mobile .feed-empty-title {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 8px;
  }
  .sa-mobile .feed-empty-body {
    font-size: 14px;
    line-height: 1.55;
    color: rgba(255,255,255,0.55);
    max-width: 300px;
    margin-bottom: 20px;
  }

  @keyframes shimmerSlide {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .sa-mobile .screen-enter { animation: fadeUp 300ms cubic-bezier(0.22,1,0.36,1) both; }
  .sa-mobile .nav-enter   { animation: navPop 360ms cubic-bezier(0.34,1.2,0.64,1) both; }

  /* ── Native screen transitions (tab + stack) ── */
  .sa-mobile .mobile-screen-host {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    isolation: isolate;
  }
  .sa-mobile .mobile-tab-stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .sa-mobile .mobile-tab-pane {
    position: absolute;
    inset: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    z-index: 1;
    transform: translate3d(0, 0, 0);
    will-change: transform, opacity;
  }
  .sa-mobile .mobile-tab-pane.is-exiting {
    opacity: 1;
    visibility: visible;
    pointer-events: none;
    z-index: 3;
  }
  .sa-mobile .mobile-tab-pane.is-active {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    z-index: 2;
  }
  .sa-mobile .mobile-tab-pane.is-under-stack {
    opacity: 1;
    visibility: visible;
    pointer-events: none;
    z-index: 1;
    transform: scale(0.98);
    filter: brightness(0.72);
    transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1), filter 320ms ease;
  }
  .sa-mobile .mobile-tab-pane.tab-enter-left {
    animation: mobileTabEnterLeft 340ms cubic-bezier(0.32, 0.72, 0, 1) both;
  }
  .sa-mobile .mobile-tab-pane.tab-exit-left {
    animation: mobileTabExitLeft 340ms cubic-bezier(0.32, 0.72, 0, 1) both;
    z-index: 3;
  }
  .sa-mobile .mobile-tab-pane.tab-enter-right {
    animation: mobileTabEnterRight 340ms cubic-bezier(0.32, 0.72, 0, 1) both;
  }
  .sa-mobile .mobile-tab-pane.tab-exit-right {
    animation: mobileTabExitRight 340ms cubic-bezier(0.32, 0.72, 0, 1) both;
    z-index: 3;
  }
  .sa-mobile .mobile-stack-layer {
    position: absolute;
    inset: 0;
    z-index: 24;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background: #07090F;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.28);
    will-change: transform, opacity;
  }
  .sa-mobile .mobile-stack-layer.mobile-trans-forward {
    animation: mobileStackPushIn 360ms cubic-bezier(0.32, 0.72, 0, 1) both;
  }
  .sa-mobile .mobile-stack-layer.mobile-trans-back {
    animation: mobileStackPopIn 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
  }
  .sa-mobile .mobile-stack-layer.mobile-trans-modal-in {
    animation: mobileModalIn 400ms cubic-bezier(0.32, 0.72, 0, 1) both;
    box-shadow: none;
  }
  .sa-mobile .mobile-stack-layer.mobile-trans-modal-out {
    animation: mobileModalOut 300ms cubic-bezier(0.32, 0.72, 0, 1) both;
    box-shadow: none;
  }
  .sa-mobile .mobile-tab-scroll {
    height: 100%;
    min-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
  }

  @keyframes mobileTabEnterLeft {
    from { opacity: 0.4; transform: translate3d(32%, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes mobileTabExitLeft {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0.35; transform: translate3d(-26%, 0, 0); }
  }
  @keyframes mobileTabEnterRight {
    from { opacity: 0.4; transform: translate3d(-32%, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes mobileTabExitRight {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0.35; transform: translate3d(26%, 0, 0); }
  }
  @keyframes mobileStackPushIn {
    from { opacity: 0.92; transform: translate3d(100%, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes mobileStackPopIn {
    from { opacity: 0.88; transform: translate3d(-18%, 0, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes mobileModalIn {
    from { opacity: 0.96; transform: translate3d(0, 100%, 0); }
    to   { opacity: 1; transform: translate3d(0, 0, 0); }
  }
  @keyframes mobileModalOut {
    from { opacity: 1; transform: translate3d(0, 0, 0); }
    to   { opacity: 0.9; transform: translate3d(0, 100%, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .sa-mobile .mobile-tab-pane,
    .sa-mobile .mobile-stack-layer {
      animation: none !important;
      transition: none !important;
      transform: none !important;
      filter: none !important;
    }
  }

  .sa-mobile [data-brand-fix].brand-fix-highlight {
    outline: 2px solid rgba(52, 211, 153, 0.75);
    outline-offset: 3px;
    border-radius: 14px;
    animation: brandFixPulse 1.6s ease-in-out 2;
  }
  @keyframes brandFixPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
    50% { box-shadow: 0 0 0 8px rgba(52, 211, 153, 0.18); }
  }

  /* ── Desktop browser preview only (≥1280px) — WebView/tablet full width below ── */
  @media (min-width: 1280px) {
    .sa-mobile-outer {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: stretch;
      justify-content: center;
      background: #000;
    }

    .sa-mobile-frame {
      position: relative;
      /* IG web feed column ~470–630px; comfortable dev preview without over-narrowing */
      width: min(630px, calc(100vw - 48px));
      height: 100vh;
      max-height: 100dvh;
      overflow: hidden;
      flex-shrink: 0;
      transform: translateZ(0);
      background: var(--sa-mobile-bg, #000);
      border-left: 0.5px solid rgba(255, 255, 255, 0.08);
      border-right: 0.5px solid rgba(255, 255, 255, 0.08);
    }
  }

  @media (min-width: 1440px) {
    .sa-mobile-frame {
      width: min(720px, calc(100vw - 80px));
    }
  }

  /* Story / reel — edge-to-edge inside phone frame (IG mobile feed sizing) */
  .sa-mobile .ig-vertical-media-card {
    width: 100%;
    max-width: none;
    margin-inline: 0;
  }

  .sa-mobile .ig-vertical-media-stage {
    position: relative;
    background: #000;
    width: 100%;
    max-width: none;
    aspect-ratio: 9 / 16;
    overflow: hidden;
  }

  /* Instagram home feed — full column width, no side gutters on media */
  .sa-mobile .ig-feed-shell {
    width: 100%;
    max-width: 100%;
    position: relative;
  }

  .sa-mobile .ig-feed-pull-indicator {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 52px);
    left: 0;
    right: 0;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 35;
    pointer-events: none;
  }

  .sa-mobile .ig-feed-pull-spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.18);
    border-top-color: rgba(255, 255, 255, 0.82);
  }

  .sa-mobile .ig-feed-pull-spinner.is-spinning {
    animation: spinSlow 0.8s linear infinite;
  }

  .sa-mobile .ig-feed-media-stage {
    width: 100%;
    max-width: none;
    background: #000;
  }

  /* Reels in home feed — fixed 4:5 crop (IG shows reels in feed as 4:5, not full 9:16) */
  .sa-mobile .ig-feed-reel-stage {
    width: 100%;
    max-width: none;
    aspect-ratio: 4 / 5;
    margin-inline: 0;
  }

  /* Posts — IG clamped aspect (4:5 … 1.91:1), cover crop inside frame */
  .sa-mobile .ig-feed-post-stage {
    width: 100%;
    max-width: none;
    margin-inline: 0;
    overflow: hidden;
  }

  .sa-mobile .ig-feed-post {
    width: 100%;
    max-width: none;
  }

  /* ── SmartAgency chrome shell (non-feed screens) ── */
  .sa-mobile .sa-chrome-shell {
    position: relative;
    min-height: 100dvh;
    isolation: isolate;
    background: #07090F;
  }
  .sa-mobile .sa-chrome-shell--light {
    background: #F4F6F8;
  }
  .sa-mobile .sa-chrome-ambient {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background:
      radial-gradient(ellipse 110% 70% at 50% -8%, rgba(77,112,136,0.22) 0%, transparent 58%),
      radial-gradient(ellipse 55% 45% at 100% 0%, rgba(138,171,189,0.10) 0%, transparent 52%),
      radial-gradient(ellipse 50% 40% at 0% 12%, rgba(200,168,106,0.06) 0%, transparent 48%);
  }
  .sa-mobile .sa-chrome-shell--light .sa-chrome-ambient {
    background:
      radial-gradient(ellipse 100% 60% at 50% -5%, rgba(77,112,136,0.10) 0%, transparent 55%),
      radial-gradient(ellipse 45% 35% at 100% 0%, rgba(138,171,189,0.06) 0%, transparent 50%);
  }
  .sa-mobile .sa-chrome-mark {
    position: absolute;
    top: max(8px, env(safe-area-inset-top, 0px));
    right: max(-12px, calc(env(safe-area-inset-right, 0px) - 12px));
    width: min(200px, 52vw);
    height: min(124px, 32vw);
    opacity: 0.055;
    pointer-events: none;
    z-index: 0;
    background: url('/smartagency-mark.png') right top / contain no-repeat;
    filter: saturate(0.85) contrast(1.05);
  }
  .sa-mobile .sa-chrome-shell--light .sa-chrome-mark {
    opacity: 0.04;
    filter: saturate(0.7) brightness(0.55);
  }
  .sa-mobile .sa-chrome-hairline {
    position: absolute;
    top: 0;
    left: 10%;
    right: 10%;
    height: 1px;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(138,171,189,0.35) 35%,
      rgba(200,168,106,0.22) 50%,
      rgba(138,171,189,0.35) 65%,
      transparent 100%
    );
  }
  .sa-mobile .sa-chrome-content {
    position: relative;
    z-index: 2;
    min-height: 100dvh;
  }
  /* Let ambient chrome show through screen roots */
  .sa-mobile .sa-chrome-shell > .sa-chrome-content > * {
    background: transparent !important;
  }
  .sa-mobile .sa-chrome-header {
    background: rgba(7,9,15,0.72) !important;
    border-bottom-color: rgba(138,171,189,0.12) !important;
  }
  .sa-mobile[data-theme="light"] .sa-chrome-header {
    background: rgba(244,246,248,0.82) !important;
    border-bottom-color: rgba(61,104,128,0.12) !important;
  }
  .sa-mobile .sa-chrome-card {
    background: linear-gradient(165deg, rgba(19,26,36,0.94) 0%, rgba(12,16,24,0.88) 100%);
    border: 0.5px solid rgba(138,171,189,0.14);
    border-radius: 20px;
    box-shadow:
      0 16px 40px rgba(0,0,0,0.28),
      inset 0 1px 0 rgba(255,255,255,0.06);
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .sa-mobile[data-theme="light"] .sa-chrome-card {
    background: linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.94) 100%);
    border-color: rgba(61,104,128,0.12);
    box-shadow: 0 12px 32px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9);
  }
  .sa-mobile .sa-chrome-card:active {
    transform: scale(0.985);
  }
  .sa-mobile .sa-chrome-menu-row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 15px 16px;
    border: none;
    cursor: pointer;
    text-align: left;
    border-radius: 18px;
    background: linear-gradient(155deg, rgba(255,255,255,0.04) 0%, rgba(12,16,24,0.35) 100%);
    border: 0.5px solid rgba(138,171,189,0.10);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .sa-mobile[data-theme="light"] .sa-chrome-menu-row {
    background: linear-gradient(155deg, rgba(255,255,255,0.96) 0%, rgba(244,246,248,0.9) 100%);
    border-color: rgba(61,104,128,0.10);
  }
  .sa-mobile .sa-chrome-menu-row:active {
    transform: scale(0.985);
    background: linear-gradient(155deg, rgba(138,171,189,0.08) 0%, rgba(12,16,24,0.4) 100%);
  }
  .sa-mobile .sa-chrome-icon-tile {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(77,112,136,0.14);
    border: 0.5px solid rgba(138,171,189,0.22);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
  }
  .sa-mobile .sa-chrome-nav-dock {
    box-shadow:
      0 0 0 0.5px rgba(138,171,189,0.18),
      0 20px 50px rgba(0,0,0,0.45),
      0 4px 16px rgba(0,0,0,0.25),
      inset 0 1px 0 rgba(255,255,255,0.08) !important;
    background: rgba(7,9,15,0.88) !important;
    border-color: rgba(138,171,189,0.14) !important;
  }
  .sa-mobile[data-theme="light"] .sa-chrome-nav-dock {
    background: rgba(255,255,255,0.92) !important;
    border-color: rgba(61,104,128,0.14) !important;
    box-shadow:
      0 0 0 0.5px rgba(61,104,128,0.12),
      0 16px 40px rgba(15,23,42,0.10),
      inset 0 1px 0 rgba(255,255,255,0.95) !important;
  }
  .sa-mobile .sa-chrome-orb-ring {
    box-shadow:
      0 0 0 1px rgba(138,171,189,0.35),
      0 10px 32px rgba(77,112,136,0.35),
      inset 0 1px 0 rgba(255,255,255,0.12) !important;
  }
  .sa-mobile .sa-chrome-orb-ring--active {
    box-shadow:
      0 0 0 2px rgba(138,171,189,0.45),
      0 0 24px rgba(138,171,189,0.28),
      0 12px 36px rgba(77,112,136,0.4),
      inset 0 1px 0 rgba(255,255,255,0.14) !important;
  }
  .sa-mobile .sa-chrome-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(138,171,189,0.72);
  }
  .sa-mobile[data-theme="light"] .sa-chrome-eyebrow {
    color: rgba(61,104,128,0.65);
  }
  .sa-mobile .sa-chrome-profile-hero {
    background: linear-gradient(
      180deg,
      rgba(77,112,136,0.14) 0%,
      rgba(7,9,15,0) 100%
    );
    border-bottom: 0.5px solid rgba(138,171,189,0.10);
  }
  .sa-mobile[data-theme="light"] .sa-chrome-profile-hero {
    background: linear-gradient(180deg, rgba(77,112,136,0.07) 0%, transparent 100%);
  }

  /* Brand hub — premium studio tiles */
  .sa-mobile .brand-hub-tile {
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .sa-mobile .brand-hub-tile:active {
    transform: scale(0.97);
  }
  .sa-mobile .brand-hub-gap-cta:active {
    transform: scale(0.985);
  }
  .sa-mobile .brand-hub-gap-cta {
    transition: transform 160ms ease;
  }

  /* Reels fullscreen snap pager */
  .sa-reels-root {
    position: fixed;
    inset: 0;
    z-index: 820;
    background: #000;
    animation: saReelsEnter 180ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .sa-reels-scroller {
    height: 100%;
    height: 100dvh;
    overflow-y: auto;
    scroll-snap-type: y mandatory;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .sa-reels-slide {
    position: relative;
    width: 100%;
    height: 100%;
    height: 100dvh;
    scroll-snap-align: start;
    scroll-snap-stop: always;
    overflow: hidden;
    background: #000;
    flex-shrink: 0;
  }
  @keyframes saReelsEnter {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes saHeartPop {
    0% { opacity: 0; transform: scale(0.35); }
    35% { opacity: 1; transform: scale(1.12); }
    70% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.08); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sa-reels-root, .sa-double-tap-heart svg {
      animation: none !important;
    }
  }

  /* Feed engagement sheets */
  .sa-feed-sheet-root {
    position: fixed;
    inset: 0;
    z-index: 860;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .sa-feed-sheet-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.48);
    cursor: pointer;
  }
  .sa-feed-sheet-panel {
    position: relative;
    width: min(100%, 480px);
    max-height: 88dvh;
    border-radius: 18px 18px 0 0;
    display: flex;
    flex-direction: column;
    animation: saSheetUp 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .sa-feed-comments-panel {
    height: min(88dvh, 720px);
  }
  .sa-feed-sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: rgba(128, 128, 128, 0.45);
    margin: 10px auto 4px;
    flex-shrink: 0;
  }
  @keyframes saSheetUp {
    from { transform: translateY(24%); opacity: 0.6; }
    to { transform: translateY(0); opacity: 1; }
  }

  /* Story viewer — full-bleed on phone WebView */
  @media (max-width: 767px) {
    .ig-story-viewer-column {
      width: 100%;
      max-height: 100dvh;
      height: 100dvh;
    }
    .ig-story-viewer-stage {
      flex: 1 1 auto;
      aspect-ratio: auto;
      height: auto;
      min-height: 0;
    }
  }
  .ig-story-viewer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 800;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.96);
    overflow: hidden;
  }
  .ig-story-viewer-column {
    display: flex;
    flex-direction: column;
    width: min(100%, calc((100dvh - 120px) * 9 / 16), 420px);
    max-height: 100dvh;
    flex: 0 1 auto;
  }
  .ig-story-viewer-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 9 / 16;
    flex: 0 0 auto;
    overflow: hidden;
    background: #000;
  }
  .ig-story-viewer-dock {
    flex-shrink: 0;
    position: relative;
    z-index: 30;
    width: 100%;
    pointer-events: auto;
  }
  @media (min-width: 768px) {
    .ig-story-viewer-column {
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
    }
    .ig-story-viewer-stage {
      border-radius: 12px 12px 0 0;
    }
    .ig-story-viewer-dock {
      border-radius: 0 0 12px 12px;
    }
  }

  /* Phones + tablets (WebView-first) — no artificial column; feed media is full viewport width */
  @media (max-width: 1279px) {
    .sa-mobile-outer { display: contents; }
    .sa-mobile-frame { display: contents; }
  }

  /* Stack screens (Plan, Ayarlar, …) — centered column on tablet, feed stays full bleed */
  @media (min-width: 768px) and (max-width: 1279px) {
    .sa-mobile .sa-stack-screen {
      max-width: 720px;
      width: 100%;
      margin-left: auto;
      margin-right: auto;
    }
  }

  /* Responsive bottom sheet — mobile peek + tablet centered panel (not full-screen) */
  .sa-responsive-sheet-root {
    position: fixed;
    inset: 0;
    z-index: 650;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    pointer-events: none;
  }
  .sa-responsive-sheet-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    margin: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    animation: fadeIn 180ms ease both;
    pointer-events: auto;
    cursor: pointer;
  }
  .sa-responsive-sheet-panel {
    position: relative;
    z-index: 1;
    width: 100%;
    max-height: min(78dvh, 640px);
    display: flex;
    flex-direction: column;
    border-radius: 22px 22px 0 0;
    box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.42);
    animation: slideUp 280ms cubic-bezier(0.4, 0, 0.2, 1) both;
    overflow: hidden;
    pointer-events: auto;
  }
  .sa-responsive-sheet-panel--tall {
    max-height: min(82dvh, 720px);
  }
  .sa-responsive-sheet-root--fullscreen {
    align-items: stretch;
    pointer-events: auto;
  }
  .sa-responsive-sheet-panel--fullscreen {
    width: 100%;
    max-height: 100dvh;
    height: 100dvh;
    border-radius: 0;
    box-shadow: none;
    animation: slideUpFull 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
  }
  @keyframes slideUpFull {
    from { transform: translate3d(0, 100%, 0); }
    to { transform: translate3d(0, 0, 0); }
  }
  .sa-responsive-sheet-panel--fullscreen .sa-plan-node-collapse {
    max-height: min(62dvh, 560px);
  }
  .sa-responsive-sheet-handle {
    display: flex;
    justify-content: center;
    padding: 10px 0 2px;
    flex-shrink: 0;
  }
  .sa-responsive-sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
  @media (min-width: 768px) {
    .sa-responsive-sheet-root {
      align-items: center;
      padding: max(20px, env(safe-area-inset-top, 0px)) 20px max(20px, env(safe-area-inset-bottom, 0px));
    }
    .sa-responsive-sheet-root--fullscreen {
      align-items: stretch;
      padding: 0;
    }
    .sa-responsive-sheet-panel {
      width: min(520px, 100%);
      max-height: min(72dvh, 620px);
      border-radius: 20px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
    }
    .sa-responsive-sheet-panel--tall {
      max-height: min(78dvh, 680px);
      width: min(560px, 100%);
    }
    .sa-responsive-sheet-panel--fullscreen {
      width: min(560px, 100%);
      max-height: min(92dvh, 820px);
      height: min(92dvh, 820px);
      margin: max(16px, env(safe-area-inset-top, 0px)) auto max(16px, env(safe-area-inset-bottom, 0px));
      border-radius: 20px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
    }
    .sa-responsive-sheet-handle {
      display: none;
    }
  }
  @media (min-width: 1280px) {
    .sa-responsive-sheet-panel {
      width: min(480px, calc(100% - 24px));
    }
    .sa-responsive-sheet-panel--tall {
      width: min(520px, calc(100% - 24px));
    }
  }

  .sa-plan-node-collapse {
    max-height: min(50dvh, 420px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
  }
  @media (min-width: 768px) {
    .sa-plan-node-collapse {
      max-height: min(40dvh, 360px);
    }
  }
`;

const NO_NAV = new Set(['creative-preview', 'approval', 'new-brief', 'platform-preview']);

function Splash() {
  return <BrandLoadingScreen />;
}

function AppShell() {
  const { t } = useTheme();
  const isChecking = useAuthStore((s) => s.isChecking);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);
  const showProfile = useAuthStore((s) => s.showProfile);
  const closeProfile = useAuthStore((s) => s.closeProfile);
  const setTenantFromSession = useWorkspaceStore((s) => s.setTenantFromSession);
  const tenantId = useActiveTenantId();
  const queryClient = useQueryClient();
  const screen = useMobileStore(s => s.screen);
  const noNav = NO_NAV.has(screen);

  // Show login form vs onboarding
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    // Mobile auth is token-driven. If there is no local JWT, never auto-login
    // from demo/cookie fallback after refresh.
    if (!getSessionToken()) {
      setUser(null);
      setShowLogin(true);
      return;
    }

    apiClient.getCurrentUserSecurity()
      .then(me => {
        if (me.isDemoFallback) {
          setUser(null);
          setShowLogin(true);
          return;
        }
        // Sync workspace store with the authenticated user's tenant.
        // This is the critical fix: without this, tenantId stays as DEFAULT_TENANT_ID
        // (000...001 / Sunu Event) on every page reload regardless of who is logged in.
        if (me.tenantId) {
          setTenantFromSession(me.tenantId);
          invalidateTenantBrandQueries(me.tenantId);
        }
        setUser(me);
      })
      .catch(() => {
        setUser(null);
        setShowLogin(true);
      });
  }, [setUser, setTenantFromSession]);

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;
    const prefetch = () => {
      void import('./_components/screens/PlatformFeed');
      void import('./_components/screens/MissionHub');
      void prefetchMobileScreen('MoreMenu', () =>
        import('./_components/screens/MoreMenu').then((m) => ({ default: m.MoreMenu })));
      void queryClient.prefetchQuery({
        queryKey: ['missions', tenantId],
        queryFn: () => apiClient.listMissionsForHub(tenantId),
        staleTime: 45_000,
      });
      void queryClient.prefetchQuery(
        getMobileArtifactsQueryOptions(tenantId, { limit: MOBILE_ARTIFACT_MISSION_POOL_LIMIT }),
      );
      void queryClient.prefetchQuery({
        queryKey: ['integrations'],
        queryFn: () => apiClient.getIntegrations(),
        staleTime: 60_000,
      });
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(prefetch, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(prefetch, 800);
    return () => clearTimeout(t);
  }, [isAuthenticated, tenantId, queryClient]);

  useEffect(() => {
    const onAuthChanged = () => {
      // Logout: return to login form.
      if (!getSessionToken()) {
        setShowLogin(true);
      }
      // Do NOT set showLogin(false) when a token appears — LoginScreen sets the user
      // right after setSessionToken; flipping showLogin here briefly renders OnboardingFlow
      // ("Markanızı tanıyalım") before isAuthenticated becomes true.
    };
    window.addEventListener('smartagency-auth-changed', onAuthChanged);
    return () => window.removeEventListener('smartagency-auth-changed', onAuthChanged);
  }, []);

  const base: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: t.bg,
    fontFamily: '-apple-system,"SF Pro Display","SF Pro Text",system-ui,sans-serif',
    color: t.textPrimary,
    transition: 'background 250ms ease',
  };

  if (isChecking) return <div style={base}><Splash /></div>;

  if (!isAuthenticated) {
    if (showLogin) {
      return (
        <div style={base}>
          <LoginScreen onSignup={() => setShowLogin(false)} />
        </div>
      );
    }
    return (
      <div style={base}>
        <OnboardingFlow
          onComplete={async () => {
            // Signup saved the token; now load the user to flip isAuthenticated → true
            // This transitions AppShell to the main app ONLY after Welcome step
            try {
              const me = await apiClient.getCurrentUserSecurity();
              if (me.isDemoFallback) {
                setUser(null);
                setShowLogin(true);
                return;
              }
              // Sync workspace store to the newly registered tenant before rendering main app
              if (me.tenantId) {
                setTenantFromSession(me.tenantId);
                invalidateTenantBrandQueries(me.tenantId);
              }
              setUser(me);
            } catch {
              setUser(null);
            }
          }}
          onLogin={() => setShowLogin(true)}
        />
      </div>
    );
  }

  return (
    <>
      <div style={{
        ...base,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <MobileScreenRouter />
      </div>
      {!noNav && <MobileNav />}
      {showProfile && <ProfileSheet onClose={closeProfile} />}
    </>
  );
}

export default function MobilePage() {
  return (
    <MobileThemeProvider>
      <style>{CSS}</style>
      {/* Outer backdrop (desktop only — mobile: display:contents) */}
      <div className="sa-mobile-outer">
        {/* Phone frame: transform:translateZ(0) captures position:fixed children */}
        <div className="sa-mobile-frame">
          {/* sa-mobile scopes all CSS rules — prevents leaking into admin panel */}
          <div className="sa-mobile" style={{ display: 'contents' }}>
            <TenantBrandProvider>
              <MobileArtifactsPoller />
              <AppShell />
            </TenantBrandProvider>
          </div>
        </div>
      </div>
    </MobileThemeProvider>
  );
}
