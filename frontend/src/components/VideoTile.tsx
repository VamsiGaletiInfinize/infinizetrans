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
    <div className="relative overflow-hidden rounded-xl bg-slate-800 shadow-lg">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        muted={isLocal}
      />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {isLocal ? 'You' : attendeeId.slice(0, 8)}
      </span>
    </div>
  );
}
