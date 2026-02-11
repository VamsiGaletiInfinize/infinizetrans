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
}

/* ------------------------------------------------------------------ */
/*  Caption display model                                              */
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

/* ------------------------------------------------------------------ */
/*  Chat message (for ChatPanel component)                             */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  senderAttendeeId: string;
  senderName: string;
  originalText: string;
  translatedText: string;
  timestamp: number;
}
