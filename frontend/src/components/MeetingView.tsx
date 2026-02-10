'use client';

import { useCallback } from 'react';
import { MeetingInfo } from '@/types';
import { useMeetingSession } from '@/hooks/useMeetingSession';
import {
  useTranslationSocket,
  TranslationSocketOptions,
} from '@/hooks/useTranslationSocket';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import VideoTile from './VideoTile';
import CaptionsPanel from './CaptionsPanel';
import Controls from './Controls';

interface MeetingViewProps {
  meetingInfo: MeetingInfo;
  attendeeName: string;
  spokenLanguage: string;
  onLeave: () => void;
}

export default function MeetingView({
  meetingInfo,
  attendeeName,
  spokenLanguage,
  onLeave,
}: MeetingViewProps) {
  const meetingId = meetingInfo.meeting.MeetingId;
  const attendeeId = meetingInfo.attendee.AttendeeId;

  const {
    joined,
    tiles,
    muted,
    videoOn,
    micStream,
    bindVideo,
    toggleMute,
    toggleVideo,
    leave,
  } = useMeetingSession(meetingInfo.meeting, meetingInfo.attendee);

  const socketOpts: TranslationSocketOptions | null = joined
    ? {
        meetingId,
        attendeeId,
        attendeeName,
        spokenLanguage,
        targetLanguage: spokenLanguage,
      }
    : null;

  const { captions, connected, sendAudioFrame } =
    useTranslationSocket(socketOpts);

  const handleAudioFrame = useCallback(
    (pcm: ArrayBuffer) => sendAudioFrame(pcm),
    [sendAudioFrame],
  );

  useAudioCapture({
    enabled: joined && connected,
    stream: micStream,
    onAudioFrame: handleAudioFrame,
  });

  const handleLeave = () => {
    leave();
    onLeave();
  };

  return (
    <div className="flex h-screen flex-col gap-3 bg-slate-900 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Meeting</h2>
          <p className="text-xs text-slate-400">
            ID: <span className="select-all font-mono">{meetingId}</span>
          </p>
        </div>
        {!joined && (
          <span className="animate-pulse text-sm text-yellow-400">
            Connecting to meeting…
          </span>
        )}
      </div>

      {/* Main: video + captions panel */}
      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Video grid */}
        <div className="flex-1">
          <div className="grid h-full auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2">
            {tiles.map((t) => (
              <VideoTile
                key={t.tileId}
                tileId={t.tileId}
                isLocal={t.isLocal}
                attendeeId={t.attendeeId}
                bindVideo={bindVideo}
              />
            ))}
            {tiles.length === 0 && (
              <div className="flex items-center justify-center rounded-xl bg-slate-800 text-slate-500">
                No video yet
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Live Captions */}
        <div className="flex w-80 flex-shrink-0 flex-col rounded-xl bg-slate-800/60">
          <div className="border-b border-slate-700 py-2 text-center text-xs font-semibold uppercase tracking-wide text-blue-400">
            Live Captions
          </div>
          <div className="flex-1 overflow-hidden">
            <CaptionsPanel captions={captions} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <Controls
        muted={muted}
        videoOn={videoOn}
        wsConnected={connected}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onLeave={handleLeave}
      />
    </div>
  );
}
