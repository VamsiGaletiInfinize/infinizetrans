'use client';

import { useCallback, useState } from 'react';
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
import CallSummary from './CallSummary';

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
  const [captionsOpen, setCaptionsOpen] = useState(true);
  const [showSummary, setShowSummary] = useState(false);

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
    enabled: joined && connected && !muted,
    stream: micStream,
    onAudioFrame: handleAudioFrame,
  });

  const handleLeave = () => {
    leave();
    setShowSummary(true);
  };

  if (showSummary) {
    return (
      <CallSummary
        captions={captions}
        attendeeName={attendeeName}
        onClose={onLeave}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Infinize Trans</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500">
                Meeting ID: <span className="select-all font-mono text-gray-700">{meetingId}</span>
              </p>
              {/* Connection status dot */}
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-400'}`} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!joined && (
            <span className="animate-gentle-pulse rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
              Connecting...
            </span>
          )}
          {/* Captions toggle */}
          <button
            onClick={() => setCaptionsOpen(!captionsOpen)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              captionsOpen
                ? 'bg-blue-50 text-blue-600'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Captions
            </span>
          </button>
        </div>
      </div>

      {/* Main: video + captions panel */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Video grid */}
        <div className="flex-1 p-4">
          <div className="grid h-full auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2">
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
              <div className="flex flex-col items-center justify-center rounded-2xl bg-gray-200/60 text-gray-400">
                <svg className="mb-2 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">No video yet</span>
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Live Captions */}
        {captionsOpen && (
          <div className="animate-fade-in flex w-80 flex-shrink-0 flex-col border-l border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Live Captions</h3>
              <button
                onClick={() => setCaptionsOpen(false)}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CaptionsPanel captions={captions} />
            </div>
          </div>
        )}
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
