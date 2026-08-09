import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estimateFalModelUsd } from '@/lib/ai-cost-catalog';
import * as telemetry from '@/lib/ai-cost-telemetry';
import {
  beginFalRequestSlot,
  clearFalRequestSlot,
  markFalRequestCompleted,
  recordFalEnqueueFailed,
  recordFalRequestSubmitted,
} from '@/lib/fal-request-tracker';
import { flushFalRequestsToCostLedger } from '@/lib/fal-cost-ledger';

describe('estimateFalModelUsd', () => {
  it('prices Kling / Luma / Ideogram for video+still (multi-sector models)', () => {
    expect(estimateFalModelUsd('fal-ai/kling-video/v3/standard/image-to-video', 'video')).toBe(0.225);
    expect(estimateFalModelUsd('fal-ai/luma-dream-machine/ray-2/image-to-video', 'video')).toBe(0.10);
    expect(estimateFalModelUsd('fal-ai/ideogram/v3', 'still')).toBe(0.06);
    expect(estimateFalModelUsd('unknown-model', 'still')).toBe(0.05);
    expect(estimateFalModelUsd('unknown-model', 'video')).toBe(0.22);
  });
});

describe('flushFalRequestsToCostLedger', () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    beginFalRequestSlot();
    emitSpy = vi.spyOn(telemetry, 'emitAiCostLine').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearFalRequestSlot();
    emitSpy.mockRestore();
  });

  it('emits one cost line per completed fal request_id (idempotent key)', async () => {
    recordFalRequestSubmitted({
      requestId: '019fe59d-08f4-7512-9b0e-04ce55b7599d',
      model: 'fal-ai/kling-video/v3/standard/image-to-video',
      kind: 'video',
    });
    markFalRequestCompleted(
      '019fe59d-08f4-7512-9b0e-04ce55b7599d',
      'https://v3b.fal.media/files/b/example.mp4',
    );

    const result = await flushFalRequestsToCostLedger({
      workspaceId: '327db521-ede2-48e0-8f06-4146ee458c50',
      missionId: 'd20c7679-b7fe-4057-8903-64ee6c676aa4',
      artifactId: '4262b2bf-cde0-4a88-9b1b-f148ec8094d0',
      ideaIndex: 8,
      slotRole: 'fal_reel_motion',
      pipeline: 'fal_reel',
    });

    expect(result.count).toBe(1);
    expect(result.recordedUsd).toBe(0.225);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    const line = emitSpy.mock.calls[0]![0] as telemetry.AiCostLine;
    expect(line.provider).toBe('fal');
    expect(line.falRequestId).toBe('019fe59d-08f4-7512-9b0e-04ce55b7599d');
    expect(line.workspaceId).toBeTruthy();
    expect(line.slotKey).toBe('8::fal_reel_motion');
    expect(line.persist).toBe(true);
  });

  it('skips enqueue-failed (no fal charge) but keeps orphan completed spends', async () => {
    recordFalEnqueueFailed({
      model: 'fal-ai/ideogram/v3',
      kind: 'still',
      httpStatus: 403,
      error: 'Exhausted balance',
    });
    recordFalRequestSubmitted({
      requestId: '019fe58d-79e9-7b03-8a4b-240d99fc1282',
      model: 'fal-ai/luma-dream-machine/ray-2/image-to-video',
      kind: 'video',
    });
    markFalRequestCompleted('019fe58d-79e9-7b03-8a4b-240d99fc1282');

    const result = await flushFalRequestsToCostLedger({
      workspaceId: 'ws-1',
      missionId: 'm-1',
      ideaIndex: 0,
      slotRole: 'campaign_story_motion',
      orphan: true,
    });

    expect(result.count).toBe(1);
    expect(result.recordedUsd).toBe(0.10);
    expect(emitSpy.mock.calls[0]![0]).toMatchObject({
      falRequestId: '019fe58d-79e9-7b03-8a4b-240d99fc1282',
      detail: expect.stringContaining('orphan_slot_fail'),
    });
  });
});
