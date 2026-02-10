import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { createMeeting, createAttendee, getMeeting } from '../services/chime';
import { saveMeeting, getMeetingRecord } from '../services/dynamodb';

export const meetingsRouter = Router();

/**
 * POST /api/meetings
 * Create a new Chime meeting and the first (host) attendee.
 */
meetingsRouter.post('/meetings', async (req: Request, res: Response) => {
  try {
    const { attendeeName, externalMeetingId } = req.body;
    if (!attendeeName) {
      return res.status(400).json({ error: 'attendeeName is required' });
    }

    const meeting = await createMeeting(externalMeetingId);
    const attendee = await createAttendee(meeting.MeetingId!, uuid());

    await saveMeeting({
      meetingId: meeting.MeetingId!,
      externalMeetingId: meeting.ExternalMeetingId || '',
      meetingData: meeting as any,
      createdAt: new Date().toISOString(),
    });

    console.log(`[API] Meeting created: ${meeting.MeetingId} by ${attendeeName}`);
    return res.json({ meeting, attendee });
  } catch (err: any) {
    console.error('[API] POST /meetings error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/meetings/:meetingId/attendees
 * Join an existing meeting by creating a new attendee.
 */
meetingsRouter.post(
  '/meetings/:meetingId/attendees',
  async (req: Request, res: Response) => {
    try {
      const { meetingId } = req.params;
      const { attendeeName } = req.body;
      if (!attendeeName) {
        return res.status(400).json({ error: 'attendeeName is required' });
      }

      // Look up meeting data (DynamoDB first, then Chime API fallback)
      let meetingData: any;
      const record = await getMeetingRecord(meetingId);
      if (record) {
        meetingData = record.meetingData;
      } else {
        try {
          meetingData = await getMeeting(meetingId);
        } catch {
          return res.status(404).json({ error: 'Meeting not found' });
        }
      }

      const attendee = await createAttendee(meetingId, uuid());

      console.log(`[API] ${attendeeName} joined meeting ${meetingId}`);
      return res.json({ meeting: meetingData, attendee });
    } catch (err: any) {
      console.error('[API] POST /meetings/:id/attendees error:', err.message);
      if (
        err.name === 'NotFoundException' ||
        err.name === 'NotFoundError' ||
        err.name === 'BadRequestException'
      ) {
        return res.status(404).json({ error: 'Meeting not found' });
      }
      return res.status(500).json({ error: err.message });
    }
  },
);
