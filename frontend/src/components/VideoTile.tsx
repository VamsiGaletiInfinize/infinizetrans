'use client';

import { useEffect, useRef } from 'react';

interface VideoTileProps {
  tileId: number;
  isLocal: boolean;
  attendeeId: string;
  bindVideo: (tileId: number, el: HTMLVideoElement) => void;
}

export default function VideoTile({
  tileId,
  isLocal,
  attendeeId,
  bindVideo,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      bindVideo(tileId, videoRef.current);
    }
  }, [tileId, bindVideo]);

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-gray-800 shadow-md ring-1 ring-gray-900/5">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        muted={isLocal}
      />
      {/* Name label */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="rounded-lg bg-gray-900/70 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {isLocal ? 'You' : attendeeId.slice(0, 8)}
        </span>
      </div>
      {/* Local badge */}
      {isLocal && (
        <div className="absolute right-3 top-3">
          <span className="rounded-md bg-blue-600/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            Local
          </span>
        </div>
      )}
    </div>
  );
}
