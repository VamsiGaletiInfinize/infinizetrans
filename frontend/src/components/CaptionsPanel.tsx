'use client';

import { useEffect, useRef } from 'react';
import { Caption } from '@/types';

interface CaptionsPanelProps {
  captions: Caption[];
}

const LANG_LABELS: Record<string, string> = {
  en: 'EN', 'zh-TW': 'ZH', fr: 'FR', ko: 'KO', es: 'ES', vi: 'VI', am: 'AM', hi: 'HI',
};

export default function CaptionsPanel({ captions }: CaptionsPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [captions]);

  if (captions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <svg className="mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <p className="text-sm text-gray-400">Captions appear here when someone speaks...</p>
      </div>
    );
  }

  return (
    <div className="captions-scroll flex h-full flex-col gap-1.5 overflow-y-auto p-3">
      {captions.map((c) => (
        <div
          key={c.id}
          className={`animate-fade-in rounded-xl px-3.5 py-2.5 text-sm ${
            c.isFinal
              ? 'bg-gray-50'
              : 'bg-gray-50/60 italic text-gray-400'
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="font-semibold text-blue-600">{c.speakerName}</span>
            {c.detectedLanguage && (
              <span className="rounded-md bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">
                {LANG_LABELS[c.detectedLanguage] || c.detectedLanguage}
              </span>
            )}
          </div>
          <p className="text-gray-700">{c.originalText}</p>
          {c.translatedText !== c.originalText && (
            <p className="mt-1 text-emerald-600">{c.translatedText}</p>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
