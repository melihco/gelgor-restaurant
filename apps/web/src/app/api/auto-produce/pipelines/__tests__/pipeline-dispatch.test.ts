import { describe, it, expect } from 'vitest';

import {
  runPipelineStages,
  type ProductionPipelineHandler,
  type SlotProductionContext,
  type SlotProductionInputs,
  type SlotProductionState,
} from '../pipeline-types';
import { falDesignHandler } from '../fal-designed-post-pipeline';
import { falOnlyHandler } from '../fal-only-pipeline';
import { falVideoHandler } from '../fal-video-pipeline';
import { productShowcaseHandler } from '../product-showcase-pipeline';

function makeCtx(
  inputs: Partial<SlotProductionInputs> = {},
  state: Partial<SlotProductionState> = {},
): SlotProductionContext {
  return {
    inputs: inputs as SlotProductionInputs,
    state: {
      imageUrl: null,
      videoUrl: null,
      falGrafikerScore: null,
      falGrafikerPass: true,
      falDesignEngine: null,
      videoProduceMeta: null,
      costDelta: 0,
      ...state,
    },
  };
}

describe('runPipelineStages', () => {
  it('runs handlers in declared order, only when canRun is true', async () => {
    const order: string[] = [];
    const handlers: ProductionPipelineHandler[] = [
      { name: 'a', canRun: () => true, run: async () => { order.push('a'); } },
      { name: 'b', canRun: () => false, run: async () => { order.push('b'); } },
      { name: 'c', canRun: () => true, run: async () => { order.push('c'); } },
    ];

    await runPipelineStages(makeCtx(), handlers);

    expect(order).toEqual(['a', 'c']);
  });

  it('lets an earlier handler mutate state that a later handler reads', async () => {
    const handlers: ProductionPipelineHandler[] = [
      {
        name: 'set-image',
        canRun: () => true,
        run: async (ctx) => { ctx.state.imageUrl = 'first'; },
      },
      {
        name: 'guarded-by-image',
        canRun: (ctx) => !ctx.state.imageUrl,
        run: async (ctx) => { ctx.state.imageUrl = 'second'; },
      },
    ];

    const ctx = makeCtx();
    await runPipelineStages(ctx, handlers);

    expect(ctx.state.imageUrl).toBe('first');
  });
});

describe('falVideoHandler.canRun', () => {
  it('runs only for a fal video slot that has a reference photo', () => {
    expect(
      falVideoHandler.canRun(makeCtx({ isFalMissionVideo: true, referenceUrl: 'https://x/p.jpg' })),
    ).toBe(true);
    expect(
      falVideoHandler.canRun(makeCtx({ isFalMissionVideo: true, referenceUrl: null })),
    ).toBe(false);
    expect(
      falVideoHandler.canRun(makeCtx({ isFalMissionVideo: false, referenceUrl: 'https://x/p.jpg' })),
    ).toBe(false);
  });
});

describe('productShowcaseHandler.canRun', () => {
  it('runs only for a product showcase slot with a reference photo', () => {
    expect(
      productShowcaseHandler.canRun(makeCtx({ isProductShowcase: true, referenceUrl: 'https://x/p.jpg' })),
    ).toBe(true);
    expect(
      productShowcaseHandler.canRun(makeCtx({ isProductShowcase: true, referenceUrl: null })),
    ).toBe(false);
    expect(
      productShowcaseHandler.canRun(makeCtx({ isProductShowcase: false, referenceUrl: 'https://x/p.jpg' })),
    ).toBe(false);
  });
});

describe('falDesignHandler.canRun', () => {
  it('runs only for an unfilled fal_design slot', () => {
    expect(falDesignHandler.canRun(makeCtx({ isFalDesignPost: true }))).toBe(true);
    expect(
      falDesignHandler.canRun(makeCtx({ isFalDesignPost: true }, { imageUrl: 'x' })),
    ).toBe(false);
    expect(falDesignHandler.canRun(makeCtx({ isFalDesignPost: false }))).toBe(false);
  });
});

describe('falOnlyHandler.canRun', () => {
  it('runs for fal_only post or video slots', () => {
    expect(falOnlyHandler.canRun(makeCtx({ isFalOnlyPost: true }))).toBe(true);
    expect(falOnlyHandler.canRun(makeCtx({ isFalOnlyVideo: true }))).toBe(true);
    expect(
      falOnlyHandler.canRun(makeCtx({ isFalOnlyPost: false, isFalOnlyVideo: false })),
    ).toBe(false);
  });
});
