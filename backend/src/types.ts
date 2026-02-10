/* ------------------------------------------------------------------ */
/*  WebSocket messages: Client → Server                                */
/* ------------------------------------------------------------------ */

export interface WsJoinMessage {
  action: 'join';
  meetingId: string;
  attendeeId: string;
  attendeeName: string;
  targetLanguage: string;
  translatedAudioEnabled: boolean;
}

export interface WsUpdateTargetMessage {
  action: 'updateTarget';
  targetLanguage: string;
}

export interface WsToggleAudioMessage {
  action: 'toggleAudio';
  enabled: boolean;
}

export interface WsChatMessage {
  action: 'chat';
  text: string;
}

export interface WsStopMessage {
  action: 'stop';
}

export type WsClientMessage =
  | WsJoinMessage
  | WsUpdateTargetMessage
  | WsToggleAudioMessage
  | WsChatMessage
  | WsStopMessage;

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

export interface ChatEvent {
  type: 'chat';
  senderAttendeeId: string;
  senderName: string;
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  targetLanguage: string;
  timestamp: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type WsServerMessage = CaptionEvent | TranslatedAudioEvent | ChatEvent | ErrorEvent;

/* ------------------------------------------------------------------ */
/*  Internal models                                                    */
/* ------------------------------------------------------------------ */

export interface ParticipantInfo {
  meetingId: string;
  attendeeId: string;
  attendeeName: string;
  targetLanguage: string;
  translatedAudioEnabled: boolean;
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
