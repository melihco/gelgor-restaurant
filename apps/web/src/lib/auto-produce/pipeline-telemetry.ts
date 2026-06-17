/**
 * Sprint 3 — auto-produce pipeline step telemetry.
 * Each production run gets a run id; steps log duration + fail reason for debugging.
 */
import { randomUUID } from 'crypto';

export type PipelineStepStatus = 'ok' | 'skipped' | 'failed';

export interface PipelineStepRecord {
  step: string;
  status: PipelineStepStatus;
  durationMs: number;
  detail?: string;
}

export interface ProductionPipelineRun {
  runId: string;
  workspaceId: string;
  missionId?: string | null;
  startedAt: string;
  steps: PipelineStepRecord[];
}

export function createProductionPipelineRun(input: {
  workspaceId: string;
  missionId?: string | null;
}): ProductionPipelineRun {
  return {
    runId: randomUUID(),
    workspaceId: input.workspaceId,
    missionId: input.missionId ?? null,
    startedAt: new Date().toISOString(),
    steps: [],
  };
}

export async function runPipelineStep<T>(
  run: ProductionPipelineRun,
  step: string,
  fn: () => Promise<T>,
  opts?: { skipDetail?: string },
): Promise<T | null> {
  const started = Date.now();
  if (opts?.skipDetail) {
    run.steps.push({
      step,
      status: 'skipped',
      durationMs: 0,
      detail: opts.skipDetail,
    });
    return null;
  }

  try {
    const result = await fn();
    run.steps.push({
      step,
      status: 'ok',
      durationMs: Date.now() - started,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run.steps.push({
      step,
      status: 'failed',
      durationMs: Date.now() - started,
      detail: message.slice(0, 500),
    });
    throw err;
  }
}

export function pipelineRunSummary(run: ProductionPipelineRun): {
  runId: string;
  totalMs: number;
  failedStep: string | null;
  stepCount: number;
} {
  const totalMs = run.steps.reduce((sum, s) => sum + s.durationMs, 0);
  const failed = run.steps.find((s) => s.status === 'failed');
  return {
    runId: run.runId,
    totalMs,
    failedStep: failed?.step ?? null,
    stepCount: run.steps.length,
  };
}

export function attachPipelineTrace(
  response: Record<string, unknown>,
  run: ProductionPipelineRun,
): Record<string, unknown> {
  return {
    ...response,
    pipelineRunId: run.runId,
    pipelineSteps: run.steps,
    pipelineSummary: pipelineRunSummary(run),
  };
}
