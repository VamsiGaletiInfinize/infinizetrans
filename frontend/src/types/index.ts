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
/*  Meeting data                                                       */
/* ------------------------------------------------------------------ */

export interface MeetingInfo {
  meeting: any;
  attendee: any;
}

/* ------------------------------------------------------------------ */
/*  Language                                                           */
/* ------------------------------------------------------------------ */

export interface LanguageOption {
  code: string;
  translateCode: string;
  label: string;
  speechSupported: boolean;
}

/* ------------------------------------------------------------------ */
/*  Caption + Chat display models                                      */
/* ------------------------------------------------------------------ */

export interface Caption {
  id: string;
  speakerAttendeeId: string;
  speakerName: string;
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  isFinal: boolean;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  senderAttendeeId: string;
  senderName: string;
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  timestamp: number;
}
