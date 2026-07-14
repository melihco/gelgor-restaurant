import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  assertProductionJobEnvelope,
  assertWorkspaceMatchesRequestTenant,
} from '@/lib/tenant-production-guard';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
const WS_A = 'd365f0e0-436e-402d-8f84-0c8fd7ab2022';
const WS_B = '431b2901-a2dc-4df6-abe3-3670d9844851';
const MISSION_A = 'f2aaa40c-8ccb-4bb3-b0fc-de09e291f2d9';

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/auto-produce', { headers });
}

describe('assertWorkspaceMatchesRequestTenant', () => {
  it('rejects internal callers when X-Tenant-Id is missing', () => {
    const res = assertWorkspaceMatchesRequestTenant(
      req({ 'X-Internal-Api-Key': INTERNAL_KEY }),
      WS_A,
    );
    expect(res?.status).toBe(400);
  });

  it('rejects internal callers when header tenant does not match body workspace', () => {
    const res = assertWorkspaceMatchesRequestTenant(
      req({
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': WS_B,
      }),
      WS_A,
    );
    expect(res?.status).toBe(403);
  });

  it('allows internal callers when header tenant matches body workspace', () => {
    const res = assertWorkspaceMatchesRequestTenant(
      req({
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': WS_A,
      }),
      WS_A,
    );
    expect(res).toBeNull();
  });
});

describe('assertProductionJobEnvelope', () => {
  it('rejects mismatched autoProduceBody.workspaceId', async () => {
    const res = assertProductionJobEnvelope({
      workspaceId: WS_A,
      missionId: MISSION_A,
      autoProduceBody: { workspaceId: WS_B, missionId: MISSION_A },
    });
    expect(res?.status).toBe(403);
  });

  it('rejects mismatched autoProduceBody.missionId', async () => {
    const res = assertProductionJobEnvelope({
      workspaceId: WS_A,
      missionId: MISSION_A,
      autoProduceBody: {
        workspaceId: WS_A,
        missionId: '00000000-0000-0000-0000-000000000099',
      },
    });
    expect(res?.status).toBe(403);
  });

  it('accepts a consistent envelope', () => {
    const res = assertProductionJobEnvelope({
      workspaceId: WS_A,
      missionId: MISSION_A,
      autoProduceBody: { workspaceId: WS_A, missionId: MISSION_A },
    });
    expect(res).toBeNull();
  });
});
