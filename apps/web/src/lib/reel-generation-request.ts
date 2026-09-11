import type { ReelGenerationRequest } from '@/lib/reel-creative-direction';

export function logReelGenerationRequest(
  request: ReelGenerationRequest,
  extras?: { model?: string | null; generationId?: string | null; phase?: string },
): void {
  console.log(JSON.stringify({
    tag: 'reel-generation',
    phase: extras?.phase ?? 'request',
    missionId: request.missionId ?? null,
    creativeId: request.creativeId ?? null,
    slotId: request.slotId ?? null,
    brandId: request.brandId ?? null,
    creativeIntent: request.creativeDirection.creativeIntent,
    motionIntensity: request.creativeDirection.motionIntensity,
    shotCount: request.shotPlan.shots.length,
    model: extras?.model ?? null,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt,
    duration: request.duration,
    generationId: extras?.generationId ?? null,
    qualityPreset: request.qualityPreset,
    cameraMovement: request.creativeDirection.cameraMovement,
  }));
}
