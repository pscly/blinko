import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { eventBus } from '@/lib/event';
import { DialogStore } from '@/store/module/Dialog';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { showTipsDialog } from '../TipsDialog';
import { EDITOR_SESSION_CONTEXT, type EditorInitialData } from './type';
import {
  hasQuickCaptureDraft,
  hasQuickCaptureIncomingSeed,
} from './quickCaptureActions';

type QuickCaptureDraftBannerState = {
  readonly message: string;
  readonly onRestore: () => void;
  readonly onClear: () => void;
  readonly onUseIncoming?: () => void;
};

type UseQuickCaptureDraftGuardArgs = {
  readonly mode: 'create' | 'edit';
  readonly initialData?: EditorInitialData;
  readonly getLiveDraftState?: () => {
    readonly content: string;
    readonly filesCount: number;
    readonly referencesCount: number;
  };
};

const getContextOnlyInitialData = (initialData?: EditorInitialData): EditorInitialData | undefined => {
  if (initialData?.context === EDITOR_SESSION_CONTEXT.quickCapture) {
    return { context: initialData.context };
  }

  return undefined;
};

export const useQuickCaptureDraftGuard = ({
  mode,
  initialData,
  getLiveDraftState,
}: UseQuickCaptureDraftGuardArgs) => {
  const blinko = RootStore.Get(BlinkoStore);
  const dialog = RootStore.Get(DialogStore);
  const dialogStandalone = RootStore.Get(DialogStandaloneStore);
  const allowNextDialogCloseRef = useRef(false);

  const isQuickCaptureContext = initialData?.context === EDITOR_SESSION_CONTEXT.quickCapture;
  const hasIncomingSeed = hasQuickCaptureIncomingSeed(initialData);
  const shouldProtectCreateDraft = mode === 'create' && (isQuickCaptureContext || hasIncomingSeed);
  const hasStoredCreateDraft = hasQuickCaptureDraft({
    content: blinko.createContentStorage.value?.content ?? '',
    filesCount: blinko.createAttachmentsStorage.list.length,
  });

  const [guardState, setGuardState] = useState(() => {
    if (mode !== 'create' || !shouldProtectCreateDraft || !hasStoredCreateDraft) {
      return {
        resolvedInitialData: initialData,
        pendingIncomingData: undefined,
        isDraftBannerVisible: false,
      };
    }

    return {
      resolvedInitialData: getContextOnlyInitialData(initialData),
      pendingIncomingData: initialData,
      isDraftBannerVisible: true,
    };
  });

  useEffect(() => {
    const nextState = mode !== 'create' || !shouldProtectCreateDraft || !hasStoredCreateDraft
      ? {
        resolvedInitialData: initialData,
        pendingIncomingData: undefined,
        isDraftBannerVisible: false,
      }
      : {
        resolvedInitialData: getContextOnlyInitialData(initialData),
        pendingIncomingData: initialData,
        isDraftBannerVisible: true,
      };

    if (nextState.isDraftBannerVisible) {
      blinko.noteContent = blinko.createContentStorage.value?.content ?? '';
    }

    setGuardState(nextState);
  }, [blinko, hasStoredCreateDraft, initialData, mode, shouldProtectCreateDraft]);

  useEffect(() => {
    if (mode !== 'create' || !shouldProtectCreateDraft) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const shouldProtectDraft = hasQuickCaptureDraft({
        content: blinko.createContentStorage.value?.content ?? blinko.noteContent,
        filesCount: blinko.createAttachmentsStorage.list.length,
      });

      if (!shouldProtectDraft) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [blinko, mode, shouldProtectCreateDraft]);

  useEffect(() => {
    if (mode !== 'create' || !shouldProtectCreateDraft) {
      return;
    }

    const originalClose = dialog.close.bind(dialog);

    dialog.close = () => {
      if (allowNextDialogCloseRef.current) {
        allowNextDialogCloseRef.current = false;
        originalClose();
        return;
      }

      const liveDraft = getLiveDraftState?.() ?? {
        content: blinko.createContentStorage.value?.content ?? blinko.noteContent,
        filesCount: blinko.createAttachmentsStorage.list.length,
        referencesCount: 0,
      };

      const shouldProtectDraft = hasQuickCaptureDraft(liveDraft);
      if (!shouldProtectDraft) {
        originalClose();
        return;
      }

      dialog.preventClose = true;
      showTipsDialog({
        size: 'md',
        title: '关闭速记',
        content: '当前速记内容未保存，关闭后仍会保留草稿。确定关闭吗？',
        buttonSlot: <>
          <Button className="ml-auto" color='default' onPress={() => {
            dialog.preventClose = false;
            dialogStandalone.close();
          }}>取消</Button>
          <Button color='primary' onPress={() => {
            dialog.preventClose = false;
            dialogStandalone.close();
            allowNextDialogCloseRef.current = true;
            originalClose();
          }}>保留草稿并关闭</Button>
        </>,
      });
    };

    return () => {
      dialog.close = originalClose;
      dialog.preventClose = false;
    };
  }, [blinko, dialog, dialogStandalone, getLiveDraftState, mode, shouldProtectCreateDraft]);

  const clearStoredCreateDraft = () => {
    blinko.noteContent = '';
    blinko.createContentStorage.clear();
    blinko.createAttachmentsStorage.clear();
    eventBus.emit('editor:clear');
  };

  const restoreDraft = () => {
    blinko.noteContent = blinko.createContentStorage.value?.content ?? '';
    setGuardState({
      resolvedInitialData: getContextOnlyInitialData(initialData),
      pendingIncomingData: undefined,
      isDraftBannerVisible: false,
    });
  };

  const clearDraft = () => {
    clearStoredCreateDraft();
    setGuardState({
      resolvedInitialData: getContextOnlyInitialData(initialData),
      pendingIncomingData: undefined,
      isDraftBannerVisible: false,
    });
  };

  const useIncomingDraftSeed = guardState.pendingIncomingData && hasQuickCaptureIncomingSeed(guardState.pendingIncomingData)
    ? () => {
      clearStoredCreateDraft();
      blinko.noteContent = guardState.pendingIncomingData?.text ?? '';
      blinko.createContentStorage.save({ content: guardState.pendingIncomingData?.text ?? '' });
      setGuardState({
        resolvedInitialData: guardState.pendingIncomingData,
        pendingIncomingData: undefined,
        isDraftBannerVisible: false,
      });
    }
    : undefined;

  const draftBanner = guardState.isDraftBannerVisible ? {
    message: useIncomingDraftSeed
      ? '已有未保存草稿。恢复当前草稿，或明确使用这次新的快捷输入/分享内容。'
      : '已有未保存草稿。你可以恢复继续编辑，或明确清空后重新开始。',
    onRestore: restoreDraft,
    onClear: clearDraft,
    onUseIncoming: useIncomingDraftSeed,
  } satisfies QuickCaptureDraftBannerState : undefined;

  return {
    draftBanner,
    resolvedInitialData: guardState.resolvedInitialData,
  };
};
