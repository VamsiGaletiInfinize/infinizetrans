'use client';

import { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '@/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myAttendeeId: string;
}

export default function ChatPanel({ messages, onSend, myAttendeeId }: ChatPanelProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Chat in any language — auto-translated for everyone.
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.senderAttendeeId === myAttendeeId;
          return (
            <div key={m.id} className={`mb-2 ${isMe ? 'text-right' : ''}`}>
              <span className="text-xs font-semibold text-blue-400">
                {isMe ? 'You' : m.senderName}
              </span>
              <div
                className={`mt-0.5 inline-block max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                  isMe ? 'bg-blue-600/30 text-blue-100' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {m.translatedText !== m.originalText ? (
                  <>
                    <p>{m.translatedText}</p>
                    <p className="mt-0.5 text-xs text-slate-400 italic">{m.originalText}</p>
                  </>
                ) : (
                  <p>{m.originalText}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 border-t border-slate-700 p-2">
        <input
          className="flex-1 rounded bg-slate-700 px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Type in any language…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          onClick={handleSend}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}
