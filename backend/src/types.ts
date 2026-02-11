/* ------------------------------------------------------------------ */
/*  WebSocket messages: Client → Server                                */
/* ------------------------------------------------------------------ */

export interface WsJoinMessage {
  action: 'join';
  meetingId: string;
  attendeeId: string;
  attendeeName: string;
  spokenLanguage: string;
  targetLanguage: string;
}

export interface WsStopMessage {
  action: 'stop';
}

export interface WsMicMessage {
  action: 'mic_on' | 'mic_off';
}

export type WsClientMessage = WsJoinMessage | WsStopMessage | WsMicMessage;

/* ------------------------------------------------------------------ */
/*  WebSocket messages: Server → Client                                */
/* ------------------------------------------------------------------ */

export interface CaptionEvent {
  type: 'caption';
  speakerAttendeeId: string;
  speakerName: string;
  originalText: string;
  translatedText: string;
  isFinal: boolean;
  detectedLanguage: string;
  targetLanguage: string;
  startTimeMs?: number;
  endTimeMs?: number;
}

export interface TranslatedAudioEvent {
  type: 'audio';
  speakerAttendeeId: string;
  audioData: string;
  targetLanguage: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type WsServerMessage = CaptionEvent | TranslatedAudioEvent | ErrorEvent;

/* ------------------------------------------------------------------ */
/*  Internal models                                                    */
/* ------------------------------------------------------------------ */

export interface ParticipantInfo {
  meetingId: string;
  attendeeId: string;
  attendeeName: string;
  spokenLanguage: string;
  targetLanguage: string;
}

export interface MeetingRecord {
  meetingId: string;
  externalMeetingId: string;
  meetingData: Record<string, unknown>;
  createdAt: string;
  ttl?: number;
}

/* ------------------------------------------------------------------ */
/*  REST API                                                           */
/* ------------------------------------------------------------------ */

export interface CreateMeetingRequest {
  attendeeName: string;
  externalMeetingId?: string;
}

export interface JoinMeetingRequest {
  attendeeName: string;
}

export interface MeetingResponse {
  meeting: Record<string, unknown>;
  attendee: Record<string, unknown>;
}
