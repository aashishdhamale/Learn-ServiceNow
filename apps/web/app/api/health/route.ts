import { NextResponse } from 'next/server';

/** Liveness probe for scripts and the e2e harness. */
export function GET() {
  return NextResponse.json({ ok: true });
}
