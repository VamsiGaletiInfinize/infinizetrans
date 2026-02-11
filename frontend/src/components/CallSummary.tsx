'use client';

import { useMemo } from 'react';
import { Caption } from '@/types';

interface CallSummaryProps {
  captions: Caption[];
  attendeeName: string;
  onClose: () => void;
}

export default function CallSummary({
  captions,
  attendeeName,
  onClose,
}: CallSummaryProps) {
  const finalCaptions = useMemo(
    () => captions.filter((c) => c.isFinal),
    [captions],
  );

  // Group captions by speaker
  const speakers = useMemo(() => {
    const map = new Map<string, { name: string; language: string }>();
    for (const c of finalCaptions) {
      if (!map.has(c.speakerName)) {
        map.set(c.speakerName, {
          name: c.speakerName,
          language: c.detectedLanguage,
        });
      }
    }
    return Array.from(map.values());
  }, [finalCaptions]);

  // Call duration from first to last caption
  const duration = useMemo(() => {
    if (finalCaptions.length < 2) return null;
    const ms = finalCaptions[finalCaptions.length - 1].timestamp - finalCaptions[0].timestamp;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }, [finalCaptions]);

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Call Summary</h1>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              {speakers.map((s) => (
                <span key={s.name} className="rounded-full bg-gray-100 px-2 py-0.5">
                  {s.name} ({s.language})
                </span>
              ))}
              {duration && (
                <span className="text-gray-400">Duration: {duration}</span>
              )}
              <span className="text-gray-400">
                {finalCaptions.length} messages
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {finalCaptions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              No conversation was recorded.
            </div>
          ) : (
            finalCaptions.map((c) => {
              const isMe = c.speakerName === attendeeName;
              return (
                <div
                  key={c.id}
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      isMe
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-900 shadow-sm border border-gray-100'
                    }`}
                  >
                    <div className={`mb-1 text-[10px] font-medium ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                      {c.speakerName}
                    </div>
                    <p className="text-sm leading-relaxed">{c.originalText}</p>
                    {c.translatedText && c.translatedText !== c.originalText && (
                      <p className={`mt-1 border-t pt-1 text-xs italic leading-relaxed ${
                        isMe
                          ? 'border-blue-500 text-blue-100'
                          : 'border-gray-100 text-gray-500'
                      }`}>
                        {c.translatedText}
                      </p>
                    )}
                    <div className={`mt-1 text-[10px] ${isMe ? 'text-blue-300' : 'text-gray-300'}`}>
                      {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
