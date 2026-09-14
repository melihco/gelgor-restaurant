import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

vi.mock('@/lib/server-config', () => ({
  serverConfig: { openai: { apiKey: 'test-key' } },
}));

vi.mock('@/lib/ai-cost-telemetry', () => ({ emitOpenAiCostLine: vi.fn() }));

function reply(obj: Record<string, unknown>) {
  return { choices: [{ message: { content: JSON.stringify(obj) } }], usage: {} };
}

const buf = Buffer.alloc(4096, 1);

describe('grafiker cheap-fail confirmation', () => {
  beforeEach(() => {
    create.mockReset();
    delete process.env.AI_MODEL_TIER;
  });

  it('confirms a mini/low fail with gpt-4o high and returns the confirmed verdict', async () => {
    const { runGrafikerVisionReview } = await import('@/lib/grafiker-review-service');
    create
      .mockResolvedValueOnce(reply({ score: 3, pass: false, issues: ['Clipped letters at the frame edge'] }))
      .mockResolvedValueOnce(reply({ score: 9, pass: true, issues: [] }));

    const r = await runGrafikerVisionReview(buf, 'Bu yaz sıcak günlerde', 'poster', undefined, 'agency');

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].model).toBe('gpt-4o-mini');
    expect(create.mock.calls[0][0].messages[1].content[1].image_url.detail).toBe('low');
    expect(create.mock.calls[1][0].model).toBe('gpt-4o');
    expect(create.mock.calls[1][0].messages[1].content[1].image_url.detail).toBe('high');
    expect(r).toMatchObject({ score: 9, pass: true });
  });

  it('keeps a confirmed fail (real defect) as the verdict', async () => {
    const { runGrafikerVisionReview } = await import('@/lib/grafiker-review-service');
    create
      .mockResolvedValueOnce(reply({ score: 3, pass: false, issues: ['clipped'] }))
      .mockResolvedValueOnce(reply({ score: 7, pass: false, issues: ['logo clipped bottom-right'] }));

    const r = await runGrafikerVisionReview(buf, 'Serpme köy', 'poster', undefined, 'agency');
    expect(create).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ score: 7, pass: false, issues: ['logo clipped bottom-right'] });
  });

  it('does not spend a second call when the cheap pass already passes', async () => {
    const { runGrafikerVisionReview } = await import('@/lib/grafiker-review-service');
    create.mockResolvedValueOnce(reply({ score: 8, pass: true, issues: [] }));
    const r = await runGrafikerVisionReview(buf, 'x', 'poster', undefined, 'economy');
    expect(create).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ score: 8, pass: true });
  });

  it('premium (gpt-4o/high) fail is final — no confirmation call', async () => {
    const { runGrafikerVisionReview } = await import('@/lib/grafiker-review-service');
    create.mockResolvedValueOnce(reply({ score: 5, pass: false, issues: ['sandwich'] }));
    const r = await runGrafikerVisionReview(buf, 'x', 'poster', undefined, 'premium');
    expect(create).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ score: 5, pass: false });
  });
});
