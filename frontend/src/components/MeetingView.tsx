'use client';

import { useCallback, useMemo } from 'react';
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
    roster,
    muted,
    videoOn,
    micStream,
    error,
    bindVideo,
    toggleMute,
    toggleVideo,
    leave,
    retry,
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

  // Unified connection status
  const connectionStatus = useMemo(() => {
    if (error) return { status: 'error', label: 'Connection Error', color: 'text-red-400' };
    if (!joined && !connected) return { status: 'connecting', label: 'Connecting...', color: 'text-yellow-400' };
    if (joined && !connected) return { status: 'video-only', label: 'Video Only (No Translation)', color: 'text-orange-400' };
    if (!joined && connected) return { status: 'audio-only', label: 'Audio Only (No Video)', color: 'text-orange-400' };
    return { status: 'connected', label: 'Fully Connected', color: 'text-green-400' };
  }, [joined, connected, error]);

  // Dynamic grid layout based on participant count
  const gridLayout = useMemo(() => {
    const count = tiles.length;
    if (count === 0) return 'grid-cols-1';
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  }, [tiles.length]);

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
        <div className="flex items-center gap-3">
          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${
              connectionStatus.status === 'connected' ? 'bg-green-400 animate-pulse' :
              connectionStatus.status === 'error' ? 'bg-red-400' :
              connectionStatus.status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
              'bg-orange-400'
            }`} />
            <span className={`text-sm ${connectionStatus.color}`}>
              {connectionStatus.label}
            </span>
          </div>
          {error && (
            <button
              onClick={retry}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              Retry Connection
            </button>
          )}
        </div>
      </div>

      {/* Main: video + captions panel */}
      <div className="flex flex-1 gap-3 overflow-hidden">
        {/* Video grid */}
        <div className="flex-1">
          <div className={`grid h-full auto-rows-fr gap-3 ${gridLayout}`}>
            {tiles.map((t) => (
              <VideoTile
                key={t.tileId}
                tileId={t.tileId}
                isLocal={t.isLocal}
                attendeeId={t.attendeeId}
                attendeeName={roster[t.attendeeId]}
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
