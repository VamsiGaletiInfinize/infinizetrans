'use client';

import { useState } from 'react';
import { SUPPORTED_LANGUAGES } from '@/lib/languages';

interface JoinFormProps {
  onCreateMeeting: (name: string, spokenLang: string) => Promise<void>;
  onJoinMeeting: (meetingId: string, name: string, spokenLang: string) => Promise<void>;
}

export default function JoinForm({ onCreateMeeting, onJoinMeeting }: JoinFormProps) {
  const [name, setName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [spokenLang, setSpokenLang] = useState('en-US');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return setError('Enter your name');
    setError('');
    setLoading(true);
    try {
      await onCreateMeeting(name.trim(), spokenLang);
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
      await onJoinMeeting(meetingId.trim(), name.trim(), spokenLang);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-blue-50 px-4">
      <div className="animate-fade-in w-full max-w-md">
        {/* Logo / Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Infinize Trans</h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time voice-to-voice translation
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {/* Name */}
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Your Name</label>
          <input
            className="mb-4 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="e.g. Alice"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Spoken language */}
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            I speak&hellip;
          </label>
          <select
            className="mb-2 w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            value={spokenLang}
            onChange={(e) => setSpokenLang(e.target.value)}
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          <p className="mb-6 text-xs text-gray-400">
            Your partner&apos;s speech will be automatically translated for you.
          </p>

          {/* Create */}
          <button
            className="mb-3 w-full rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:hover:shadow-sm"
            disabled={loading}
            onClick={handleCreate}
          >
            {loading ? 'Please wait\u2026' : 'Create Meeting'}
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium text-gray-400">or join existing</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Join */}
          <input
            className="mb-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Enter Meeting ID"
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
          />
          <button
            className="w-full rounded-xl border-2 border-emerald-600 bg-white py-2.5 text-sm font-medium text-emerald-600 transition-all hover:bg-emerald-50 active:scale-[0.98] disabled:opacity-50"
            disabled={loading}
            onClick={handleJoin}
          >
            {loading ? 'Joining\u2026' : 'Join Meeting'}
          </button>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Powered by AWS Chime &middot; Transcribe &middot; Translate
        </p>
      </div>
    </div>
  );
}
