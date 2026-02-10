'use client';

interface ControlsProps {
  muted: boolean;
  videoOn: boolean;
  wsConnected: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLeave: () => void;
}

export default function Controls({
  muted,
  videoOn,
  wsConnected,
  onToggleMute,
  onToggleVideo,
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
