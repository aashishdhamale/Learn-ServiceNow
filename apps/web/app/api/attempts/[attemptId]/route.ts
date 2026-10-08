import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/current-user';
import { getAttemptView } from '@/lib/server/grading';

/** Polled by the attempt page while grading runs. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const user = await getCurrentUser();
  const attempt = await getAttemptView(user.id, attemptId);
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(attempt, { headers: { 'Cache-Control': 'no-store' } });
}
