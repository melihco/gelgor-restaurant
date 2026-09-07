export { STUDIO_VERSION } from '@smartagency/contracts';
export { produceSlot } from './produce-slot';
export type { ProduceSlotAdapters } from './produce-slot';
export { produceFromQueueJob, studioDirectEnabled } from './produce-from-job';
export { executeAutoProduce } from './execute-auto-produce';
export { acceptBoundPack, bindTicket, bindFailure, describeBindFailure } from './bind';
export { studioForbidsSatoriEscape, shouldSkipPaintRematch, paintPolicyStamp } from './paint';
export { formatNeedsMotion, motionPolicyStamp } from './motion';
export { gateSlot, gateFromPublishDecision, dispositionFromGate } from './gate';
export {
  resolveLookVisionUrls,
  inlineLookVisionDataUris,
  needsLookVisionResolve,
  isAttachableVisionUrl,
} from './look-urls';
