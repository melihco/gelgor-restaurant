'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileStore } from './_components/mobile-store';
import { MobileThemeProvider, useTheme } from './_components/theme-context';
import { useAuthStore } from './_components/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
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
  AICommandCenter,
  CampaignDetail,
  CreativePreview,
  ApprovalFeedback,
  AIActivity,
  BrandConstitution,
  Templates,
  Insights,
  Campaigns,
  Outputs,
  Reviews,
  ReviewDetail,
  AgentsScreen,
  NewBrief,
  AdsOverview,
  MoreMenu,
  prefetchMobileScreen,
  NotificationsScreen,
  SettingsScreen,
  VisitorsScreen,
  BillingScreen,
  MissionHub,
  BrandRulesScreen,
  MissionContentFactory,
  PlatformFeed,
  PlatformPreviewStudio,
  ReelsStudio,
  LoginScreen,
  OnboardingFlow,
} from './_components/mobile-screen-loaders';
import { MobileArtifactsPoller } from './_components/MobileArtifactsPoller';
import { TenantBrandProvider } from './_components/TenantBrandProvider';
import { resolveClientScreen } from './_components/mobile-client-config';

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
    width: min(220px, 85vw);
    height: auto !important;
    object-fit: contain;
    filter: drop-shadow(0 6px 20px rgba(0,0,0,0.28));
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
    padding: 15px 16px;
    border-radius: 12px;
    border: 0.5px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: #F4F4F8;
    font-size: 16px;
    letter-spacing: -0.01em;
    outline: none;
    transition: border-color 160ms ease, background 160ms ease;
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
    padding: 16px;
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
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 10px;
    border-bottom: 0.5px solid rgba(255,255,255,0.08);
    background: rgba(0,0,0,0.96);
  }
  .sa-mobile .feed-skel-header-spacer { width: 52px; }
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

  /* ── Desktop / tablet — Instagram web genişliği (≥768px) ── */
  @media (min-width: 768px) {
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
      /* IG web ana feed sütunu ~630px; geniş ekranda biraz daha ferah */
      width: min(630px, calc(100vw - 40px));
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

  @media (min-width: 1100px) {
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
  }

  /* Story viewer — IG native 9:16; portal .sa-mobile-frame içinde (tam tarayıcı değil) */
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

  /* Mobile: wrappers are transparent layout containers */
  @media (max-width: 767px) {
    .sa-mobile-outer { display: contents; }
    .sa-mobile-frame { display: contents; }
  }
`;

const NO_NAV = new Set(['creative-preview', 'approval', 'new-brief', 'platform-preview']);

function ScreenRouter() {
  const screen = resolveClientScreen(useMobileStore(s => s.screen));
  const node = (() => {
    switch (screen) {
      case 'home':             return <AICommandCenter />;
      case 'campaigns':        return <Campaigns />;
      case 'campaign-detail':  return <CampaignDetail />;
      case 'creative-preview': return <CreativePreview />;
      case 'approval':         return <ApprovalFeedback />;
      case 'ai-activity':      return <AIActivity />;
      case 'brand':            return <BrandConstitution />;
      case 'templates':        return <Templates />;
      case 'insights':         return <Insights />;
      case 'outputs':          return <Outputs />;
      case 'reviews':          return <Reviews />;
      case 'review-detail':    return <ReviewDetail />;
      case 'agents':           return <AgentsScreen />;
      case 'new-brief':        return <NewBrief />;
      case 'ads':              return <AdsOverview />;
      case 'more':             return <MoreMenu />;
      case 'notifications':    return <NotificationsScreen />;
      case 'settings':         return <SettingsScreen />;
      case 'visitors':         return <VisitorsScreen />;
      case 'billing':          return <BillingScreen />;
      case 'missions':         return <MissionHub />;
      case 'brand-rules':      return <BrandRulesScreen />;
      case 'mission-factory':  return <MissionContentFactory />;
      case 'feed':             return <PlatformFeed />;
      case 'platform-preview': return <PlatformPreviewStudio />;
      case 'reels-studio':     return <ReelsStudio />;
      default:                 return <AICommandCenter />;
    }
  })();
  return <div key={screen} className="screen-enter">{node}</div>;
}

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
  const tenantId = useWorkspaceStore((s) => s.tenantId);
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
      // setSessionToken() fires this on login/register too — only show login after logout.
      if (!getSessionToken()) {
        setShowLogin(true);
      } else if (!useAuthStore.getState().isAuthenticated) {
        // Mid-onboarding token (signup) — stay on plans/welcome, not login form.
        setShowLogin(false);
      }
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
        overflowY: noNav ? 'hidden' : 'auto',
        // Extra padding for floating pill nav (58px pill + 18px gap + safe area)
        paddingBottom: noNav ? 0 : 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
      }}>
        <ScreenRouter />
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
