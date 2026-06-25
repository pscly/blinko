import { NoteType } from "@shared/lib/types";
import { PromiseState } from "@/store/standard/PromiseState";

export const EDITOR_SESSION_CONTEXT = {
  quickCapture: 'quick_capture',
} as const;

export type EditorSessionContext = (typeof EDITOR_SESSION_CONTEXT)[keyof typeof EDITOR_SESSION_CONTEXT];

export const QUICK_CAPTURE_EDITOR_ACTION = {
  timestamp: 'timestamp',
  continueWriting: 'continue_writing',
} as const;

export type QuickCaptureEditorAction = (typeof QUICK_CAPTURE_EDITOR_ACTION)[keyof typeof QUICK_CAPTURE_EDITOR_ACTION];

export type EditorInitialData = {
  readonly file?: File;
  readonly text?: string;
  readonly context?: EditorSessionContext;
}

export type OnSendContentType = {
  content: string;
  files: (FileType & { uploadPath: string })[]
  noteType: NoteType;
  references: number[]
  metadata?: any;
}

export type FileType = {
  name: string
  size: number
  previewType: 'image' | 'audio' | 'video' | 'other'
  extension: string
  preview: any
  uploadPromise: PromiseState<any>
  type: string // audio/webm
}
