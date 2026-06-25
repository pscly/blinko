export const ANDROID_SHORTCUT_ACTION_STORAGE_KEY = 'android_shortcut_action';

const ANDROID_SHORTCUT_ACTIONS = ['quick_note', 'voice_recording', 'quick_capture'] as const;

export type AndroidShortcutAction = (typeof ANDROID_SHORTCUT_ACTIONS)[number];

export type AndroidShortcutStorage = Pick<Storage, 'getItem' | 'removeItem'>;

export const parseAndroidShortcutAction = (value: string | null): AndroidShortcutAction | null => {
  switch (value) {
    case 'quick_note':
    case 'voice_recording':
    case 'quick_capture':
      return value;
    default:
      return null;
  }
};

export const consumeAndroidShortcutAction = (storage: AndroidShortcutStorage): AndroidShortcutAction | null => {
  const value = storage.getItem(ANDROID_SHORTCUT_ACTION_STORAGE_KEY);
  if (value) {
    storage.removeItem(ANDROID_SHORTCUT_ACTION_STORAGE_KEY);
  }

  return parseAndroidShortcutAction(value);
};
