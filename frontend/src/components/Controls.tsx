'use client';

import { SUPPORTED_LANGUAGES } from '@/lib/languages';

interface ControlsProps {
  muted: boolean;
  videoOn: boolean;
  translatedAudio: boolean;
  targetLanguage: string;
  wsConnected: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
  onTargetLanguageChange: (code: string) => void;
  onLeave: () => void;
}

export default function Controls({
  muted,
  videoOn,
  translatedAudio,
  targetLanguage,
  wsConnected,
  onToggleMute,
  onToggleVideo,
  onToggleAudio,
  onTargetLanguageChange,
  onLeave,
}: ControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-800 p-3">
      <button
        onClick={onToggleMute}
        className={`rounded-lg px-4 py-2 text-sm font-medium ${
          muted ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-600'
        }`}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>

      <button
        onClick={onToggleVideo}
        className={`rounded-lg px-4 py-2 text-sm font-medium ${
          !videoOn ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-600'
        }`}
      >
        {videoOn ? 'Cam Off' : 'Cam On'}
      </button>

      <button
        onClick={onToggleAudio}
        className={`rounded-lg px-4 py-2 text-sm font-medium ${
          translatedAudio ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        {translatedAudio ? 'Voice Translation: ON' : 'Voice Translation: OFF'}
      </button>

      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">Translate to:</span>
        <select
          value={targetLanguage}
          onChange={(e) => onTargetLanguageChange(e.target.value)}
          className="rounded bg-slate-700 px-2 py-1.5 text-xs text-white outline-none"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            wsConnected ? 'bg-green-400' : 'bg-red-400'
          }`}
        />
        <span className="text-slate-400">
          {wsConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="flex-1" />

      <button
        onClick={onLeave}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-700"
      >
        Leave
      </button>
    </div>
  );
}
