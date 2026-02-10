'use client';

import { useState, useCallback } from 'react';
import { MeetingInfo } from '@/types';
import { createMeeting, joinMeeting } from '@/lib/api';
import JoinForm from '@/components/JoinForm';
import MeetingView from '@/components/MeetingView';

interface ActiveMeeting {
  info: MeetingInfo;
  name: string;
  spokenLang: string;
}

export default function Home() {
  const [meeting, setMeeting] = useState<ActiveMeeting | null>(null);

  const handleCreate = useCallback(
    async (name: string, spokenLang: string) => {
      const info = await createMeeting(name);
      setMeeting({ info, name, spokenLang });
    },
    [],
  );

  const handleJoin = useCallback(
    async (meetingId: string, name: string, spokenLang: string) => {
      const info = await joinMeeting(meetingId, name);
      setMeeting({ info, name, spokenLang });
    },
    [],
  );

  const handleLeave = useCallback(() => setMeeting(null), []);

  if (!meeting) {
    return <JoinForm onCreateMeeting={handleCreate} onJoinMeeting={handleJoin} />;
  }

  return (
    <MeetingView
      meetingInfo={meeting.info}
      attendeeName={meeting.name}
      spokenLanguage={meeting.spokenLang}
      onLeave={handleLeave}
    />
  );
}
