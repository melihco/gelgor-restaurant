import { afterEach, describe, expect, it, vi } from 'vitest';

describe('isDemoContextEnabled', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
    vi.resetModules();
  });

  it('allows demo only in non-production when flag is true', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL_ENV;
    delete process.env.APP_ENV;
    process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT = 'true';
    const { isDemoContextEnabled, isProductionRuntime } = await import('@/lib/demo-context');
    expect(isProductionRuntime()).toBe(false);
    expect(isDemoContextEnabled()).toBe(true);
  });

  it('hard-blocks demo in production even when NEXT_PUBLIC flag is true (MT-5)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT = 'true';
    const { isDemoContextEnabled, isProductionRuntime } = await import('@/lib/demo-context');
    expect(isProductionRuntime()).toBe(true);
    expect(isDemoContextEnabled()).toBe(false);
  });

  it('hard-blocks when VERCEL_ENV=production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT = 'true';
    const { isDemoContextEnabled } = await import('@/lib/demo-context');
    expect(isDemoContextEnabled()).toBe(false);
  });
});
