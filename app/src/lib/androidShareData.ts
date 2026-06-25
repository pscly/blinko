import { ShowEditBlinkoModel } from '@/components/BlinkoRightClickMenu';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { readFile } from '@tauri-apps/plugin-fs';
import { z } from 'zod';

export const ANDROID_SHARE_DATA_STORAGE_KEY = 'android_share_data';

const ANDROID_QUICK_CAPTURE_OVERLAY_SOURCE = 'quick_capture_overlay';

const androidShareDataSchema = z.object({
  text: z.string().optional(),
  stream: z.string().optional(),
  content_type: z.string().nullable().optional(),
  name: z.string().optional(),
  source: z.literal(ANDROID_QUICK_CAPTURE_OVERLAY_SOURCE).optional(),
}).passthrough();

type AndroidShareData = z.infer<typeof androidShareDataSchema>;
type AndroidShareDataStorage = Pick<Storage, 'getItem' | 'removeItem'>;

const reportAndroidShareError = (message: string) => {
  console.error('Failed to process Android share data:', message);
  RootStore.Get(ToastPlugin).error(message);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const cleanSharedText = (text: string): string => {
  const trimmed = text.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseAndroidShareData = (shareData: string): AndroidShareData | null => {
  let parsedShareData: unknown;
  try {
    parsedShareData = JSON.parse(shareData);
  } catch (error) {
    reportAndroidShareError(getErrorMessage(error));
    return null;
  }

  const result = androidShareDataSchema.safeParse(parsedShareData);
  if (!result.success) {
    reportAndroidShareError(result.error.message);
    return null;
  }

  return result.data;
};

const saveQuickCaptureOverlayText = async (text: string): Promise<void> => {
  await RootStore.Get(BlinkoStore).upsertNote.call({
    content: text,
    type: RootStore.Get(BlinkoStore).noteTypeDefault,
    refresh: true,
  });
};

const openSharedFile = async (shareData: AndroidShareData): Promise<void> => {
  if (!shareData.stream || !shareData.content_type) {
    ShowEditBlinkoModel('2xl', 'create');
    return;
  }

  const contents = await readFile(shareData.stream);
  const file = new File([contents], shareData.name || 'shared_file', {
    type: shareData.content_type,
  });
  ShowEditBlinkoModel('2xl', 'create', { file });
};

const handleAndroidShareData = async (shareData: AndroidShareData): Promise<void> => {
  if (shareData.text) {
    const cleanText = cleanSharedText(shareData.text);
    if (shareData.source === ANDROID_QUICK_CAPTURE_OVERLAY_SOURCE) {
      await saveQuickCaptureOverlayText(cleanText);
      return;
    }

    ShowEditBlinkoModel('2xl', 'create', { text: cleanText });
    return;
  }

  await openSharedFile(shareData);
};

export const consumeAndroidShareData = async (storage: AndroidShareDataStorage): Promise<boolean> => {
  const shareData = storage.getItem(ANDROID_SHARE_DATA_STORAGE_KEY);
  if (!shareData) {
    return false;
  }

  storage.removeItem(ANDROID_SHARE_DATA_STORAGE_KEY);
  const parsedShareData = parseAndroidShareData(shareData);
  if (!parsedShareData) {
    return true;
  }

  try {
    await handleAndroidShareData(parsedShareData);
  } catch (error) {
    reportAndroidShareError(getErrorMessage(error));
  }

  return true;
};
