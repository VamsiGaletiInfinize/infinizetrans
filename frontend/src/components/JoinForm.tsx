'use client';

import { useState } from 'react';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';

interface JoinFormProps {
  onCreateMeeting: (name: string, targetLang: string) => Promise<void>;
  onJoinMeeting: (meetingId: string, name: string, targetLang: string) => Promise<void>;
}

export default function JoinForm({ onCreateMeeting, onJoinMeeting }: JoinFormProps) {
  const [name, setName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [targetLang, setTargetLang] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return setError('Enter your name');
    setError('');
    setLoading(true);
    try {
      await onCreateMeeting(name.trim(), targetLang);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim()) return setError('Enter your name');
    if (!meetingId.trim()) return setError('Enter a Meeting ID');
    setError('');
    setLoading(true);
    try {
      await onJoinMeeting(meetingId.trim(), name.trim(), targetLang);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mt-20 max-w-md rounded-2xl bg-slate-800 p-8 shadow-xl">
      <h1 className="mb-2 text-center text-2xl font-bold">Infinize Trans</h1>
      <p className="mb-6 text-center text-sm text-slate-400">
        Real-time multilingual video meetings
      </p>

      {/* Name */}
      <label className="mb-1 block text-xs text-slate-400">Your Name</label>
      <input
        className="mb-4 w-full rounded bg-slate-700 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="e.g. Alice"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {/* Target language */}
      <label className="mb-1 block text-xs text-slate-400">
        I want to read/hear in&hellip;
      </label>
      <select
        className="mb-6 w-full rounded bg-slate-700 px-3 py-2 text-white outline-none"
        value={targetLang}
        onChange={(e) => setTargetLang(e.target.value)}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>

      <p className="mb-6 -mt-4 text-xs text-slate-500">
        Speak any language — it will be auto-detected.
      </p>

      {/* Create */}
      <button
        className="mb-3 w-full rounded-lg bg-blue-600 py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
        disabled={loading}
        onClick={handleCreate}
      >
        {loading ? 'Please wait…' : 'Create Meeting'}
      </button>

      {/* Divider */}
      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-600" />
        <span className="text-xs text-slate-500">or join existing</span>
        <div className="h-px flex-1 bg-slate-600" />
      </div>

      {/* Join */}
      <input
        className="mb-3 w-full rounded bg-slate-700 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-green-500"
        placeholder="Meeting ID"
        value={meetingId}
        onChange={(e) => setMeetingId(e.target.value)}
      />
      <button
        className="w-full rounded-lg bg-green-600 py-2.5 font-medium hover:bg-green-700 disabled:opacity-50"
        disabled={loading}
        onClick={handleJoin}
      >
        {loading ? 'Joining…' : 'Join Meeting'}
      </button>

      {error && (
        <p className="mt-4 text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
