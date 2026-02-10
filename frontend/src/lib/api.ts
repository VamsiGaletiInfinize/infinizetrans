import { MeetingInfo } from '@/types';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export async function createMeeting(
  attendeeName: string,
): Promise<MeetingInfo> {
  const res = await fetch(`${BACKEND_URL}/api/meetings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendeeName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create meeting (${res.status})`);
  }
  return res.json();
}

export async function joinMeeting(
  meetingId: string,
  attendeeName: string,
): Promise<MeetingInfo> {
  const res = await fetch(
    `${BACKEND_URL}/api/meetings/${meetingId}/attendees`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendeeName }),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to join meeting (${res.status})`);
  }
  return res.json();
}
