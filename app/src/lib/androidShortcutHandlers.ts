import { ShowEditBlinkoModel } from '@/components/BlinkoRightClickMenu';
import { FocusEditorFixMobile } from '@/components/Common/Editor/editorUtils';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { eventBus } from '@/lib/event';
import type { AndroidShortcutAction } from './androidShortcutActions';
import { EDITOR_SESSION_CONTEXT } from '@/components/Common/Editor/type';

const assertNever = (value: never): never => {
  throw new Error(`Unhandled Android shortcut action: ${value}`);
};

export const handleAndroidShortcutAction = (action: AndroidShortcutAction) => {
  switch (action) {
    case 'quick_note':
      ShowEditBlinkoModel('2xl', 'create');
      FocusEditorFixMobile()
      break;

    case 'voice_recording':
      ShowEditBlinkoModel('2xl', 'create');
      setTimeout(() => {
        eventBus.emit('editor:startAudioRecording');
      }, 300);
      break;

    case 'quick_capture':
      ShowEditBlinkoModel('2xl', 'create', { context: EDITOR_SESSION_CONTEXT.quickCapture });
      RootStore.Get(BlinkoStore).isCreateMode = true;
      setTimeout(() => {
        eventBus.emit('editor:focus');
        FocusEditorFixMobile()
      }, 300);
      break;

    default:
      assertNever(action);
  }
};
