import { NextRequest, NextResponse } from 'next/server';
import {
  executeAutoProduce,
  type AutoProduceRequestBody,
} from '@/studio/execute-auto-produce';

export const runtime = 'nodejs';
// Vercel Pro max; locally unlimited. I2V video ~90s + multiple images + stories.
export const maxDuration = 600;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: AutoProduceRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await executeAutoProduce(body, req);
  return NextResponse.json(result.body, { status: result.status });
}
