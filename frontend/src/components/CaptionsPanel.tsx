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
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Captions appear here when someone speaks…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      {captions.map((c) => (
        <div
          key={c.id}
          className={`rounded-lg px-3 py-2 text-sm ${
            c.isFinal ? 'bg-slate-700' : 'bg-slate-700/50 italic text-slate-400'
          }`}
        >
          <div className="mb-0.5 flex items-center gap-2">
            <span className="font-semibold text-blue-400">{c.speakerName}</span>
            {c.detectedLanguage && (
              <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                {LANG_LABELS[c.detectedLanguage] || c.detectedLanguage}
              </span>
            )}
          </div>
          <p className="text-slate-300">{c.originalText}</p>
          {c.translatedText !== c.originalText && (
            <p className="mt-0.5 text-green-400">{c.translatedText}</p>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
