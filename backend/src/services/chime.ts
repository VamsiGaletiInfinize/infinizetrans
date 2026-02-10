import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  GetMeetingCommand,
} from '@aws-sdk/client-chime-sdk-meetings';
import { v4 as uuid } from 'uuid';
import { config } from '../config';

const client = new ChimeSDKMeetingsClient({ region: config.aws.region });

export async function createMeeting(externalMeetingId?: string) {
  const response = await client.send(
    new CreateMeetingCommand({
      ClientRequestToken: uuid(),
      MediaRegion: config.aws.region,
      ExternalMeetingId: externalMeetingId || uuid(),
    }),
  );
  return response.Meeting!;
}

export async function createAttendee(meetingId: string, externalUserId?: string) {
  const response = await client.send(
    new CreateAttendeeCommand({
      MeetingId: meetingId,
      ExternalUserId: externalUserId || uuid(),
    }),
  );
  return response.Attendee!;
}

export async function getMeeting(meetingId: string) {
  const response = await client.send(
    new GetMeetingCommand({ MeetingId: meetingId }),
  );
  return response.Meeting!;
}
