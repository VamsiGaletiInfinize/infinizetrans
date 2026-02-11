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
    <div className="flex items-center justify-center gap-4 border-t border-gray-200 bg-white px-6 py-3">
      {/* Left: connection status */}
      <div className="absolute left-6 flex items-center gap-1.5 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            wsConnected ? 'bg-emerald-500' : 'bg-red-400'
          }`}
        />
        <span className="text-gray-500">
          {wsConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Center: main controls */}
      <div className="flex items-center gap-3">
        {/* Mic toggle */}
        <button
          onClick={onToggleMute}
          className={`group relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
            muted
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
          {/* Tooltip */}
          <span className="pointer-events-none absolute -top-9 rounded-lg bg-gray-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {muted ? 'Unmute' : 'Mute'}
          </span>
        </button>

        {/* Camera toggle */}
        <button
          onClick={onToggleVideo}
          className={`group relative flex h-12 w-12 items-center justify-center rounded-full transition-all ${
            !videoOn
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title={videoOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {videoOn ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          )}
          {/* Tooltip */}
          <span className="pointer-events-none absolute -top-9 rounded-lg bg-gray-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {videoOn ? 'Camera off' : 'Camera on'}
          </span>
        </button>

        {/* Leave button */}
        <button
          onClick={onLeave}
          className="group relative flex h-12 w-28 items-center justify-center gap-2 rounded-full bg-red-600 text-white transition-all hover:bg-red-700 hover:shadow-lg active:scale-95"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
          <span className="text-sm font-medium">Leave</span>
        </button>
      </div>
    </div>
  );
}
