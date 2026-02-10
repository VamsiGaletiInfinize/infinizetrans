'use client';

import { useState, useCallback } from 'react';
import { MeetingInfo } from '@/types';
import { useMeetingSession } from '@/hooks/useMeetingSession';
import {
  useTranslationSocket,
  TranslationSocketOptions,
} from '@/hooks/useTranslationSocket';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import VideoTile from './VideoTile';
import CaptionsPanel from './CaptionsPanel';
import ChatPanel from './ChatPanel';
import Controls from './Controls';

interface MeetingViewProps {
  meetingInfo: MeetingInfo;
  attendeeName: string;
  initialTargetLang: string;
  onLeave: () => void;
}

export default function MeetingView({
  meetingInfo,
  attendeeName,
  initialTargetLang,
  onLeave,
}: MeetingViewProps) {
  const [targetLang, setTargetLang] = useState(initialTargetLang);
  const [translatedAudio, setTranslatedAudio] = useState(true);
  const [activeTab, setActiveTab] = useState<'captions' | 'chat'>('captions');

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
        targetLanguage: targetLang,
        translatedAudioEnabled: translatedAudio,
      }
    : null;

  const { captions, chatMessages, connected, sendAudioFrame, sendChat } =
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

      {/* Main: video + right panel */}
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

        {/* Right panel: Captions / Chat tabs */}
        <div className="flex w-80 flex-shrink-0 flex-col rounded-xl bg-slate-800/60">
          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('captions')}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide ${
                activeTab === 'captions'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Captions
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide ${
                activeTab === 'chat'
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Chat
              {chatMessages.length > 0 && activeTab !== 'chat' && (
                <span className="ml-1 inline-block h-2 w-2 rounded-full bg-blue-500" />
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'captions' ? (
              <CaptionsPanel captions={captions} />
            ) : (
              <ChatPanel
                messages={chatMessages}
                onSend={sendChat}
                myAttendeeId={attendeeId}
              />
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <Controls
        muted={muted}
        videoOn={videoOn}
        translatedAudio={translatedAudio}
        targetLanguage={targetLang}
        wsConnected={connected}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onToggleAudio={() => setTranslatedAudio((v) => !v)}
        onTargetLanguageChange={setTargetLang}
        onLeave={handleLeave}
      />
    </div>
  );
}
