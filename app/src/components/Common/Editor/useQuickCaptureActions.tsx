import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/react';
import type { Note } from '@shared/lib/types';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { eventBus } from '@/lib/event';
import { ShowEditBlinkoModel } from '@/components/BlinkoRightClickMenu';
import { showTipsDialog } from '../TipsDialog';
import { FocusEditorFixMobile } from './editorUtils';
import type { EditorStore } from './editorStore';
import {
  QUICK_CAPTURE_EDITOR_ACTION,
  type QuickCaptureEditorAction,
} from './type';
import {
  QuickCaptureRecentNoteSelector,
  formatQuickCaptureTimestamp,
  getQuickCaptureRecentNotesInput,
  hasQuickCaptureDraft,
} from './quickCaptureActions';

type UseQuickCaptureActionsArgs = {
  readonly showQuickCaptureToolbar: boolean;
  readonly store: EditorStore;
};

export const useQuickCaptureActions = ({
  showQuickCaptureToolbar,
  store,
}: UseQuickCaptureActionsArgs) => {
  const blinko = RootStore.Get(BlinkoStore);
  const dialogStandalone = RootStore.Get(DialogStandaloneStore);
  const toast = RootStore.Get(ToastPlugin);
  const { t } = useTranslation();

  const clearQuickCaptureDraft = useCallback(() => {
    blinko.noteContent = '';
    blinko.createContentStorage.clear();
    blinko.createAttachmentsStorage.clear();
    store.clearEditor();
  }, [blinko, store]);

  const notifyContinuationFailure = useCallback((error: unknown) => {
    if (error instanceof Error) {
      console.error('Quick-capture continuation failed:', error.message);
    } else {
      console.error('Quick-capture continuation failed');
    }

    toast.error('续写失败');
  }, [toast]);

  const openContinuationEditor = useCallback(async (noteId: number) => {
    try {
      const noteDetail = await api.notes.detail.mutate({ id: noteId });

      if (!noteDetail) {
        toast.error('未找到可续写的笔记');
        return;
      }

      dialogStandalone.close();
      blinko.curSelectedNote = {
        ...noteDetail,
        attachments: noteDetail.attachments ? [...noteDetail.attachments] : [],
        references: noteDetail.references ? [...noteDetail.references] : [],
        referencedBy: noteDetail.referencedBy ? [...noteDetail.referencedBy] : [],
        tags: noteDetail.tags ? [...noteDetail.tags] : [],
        comments: noteDetail.comments ? [...noteDetail.comments] : [],
      };
      ShowEditBlinkoModel('2xl', 'edit');
      FocusEditorFixMobile();
    } catch (error) {
      notifyContinuationFailure(error);
    }
  }, [blinko, dialogStandalone, notifyContinuationFailure, toast]);

  const saveQuickCaptureDraft = useCallback(async () => {
    const hasPendingUploads = store.files.some((file) => file.uploadPromise.loading.value || !file.uploadPromise.value);

    if (hasPendingUploads) {
      toast.error('当前附件仍在上传，暂时无法续写');
      return false;
    }

    const draftContent = store.vditor?.getValue() ?? '';
    const contentToSave = store.currentTagLabel ? `${draftContent}\n\n${store.currentTagLabel} ` : draftContent;

    try {
      const savedNote = await blinko.upsertNote.call({
        type: store.noteType,
        references: store.references,
        refresh: false,
        content: contentToSave,
        attachments: store.files.map((file) => ({
          name: file.name,
          path: file.uploadPromise.value,
          size: file.size,
          type: file.type,
        })),
        metadata: store.metadata,
      });

      if (!savedNote) {
        notifyContinuationFailure(new Error('Quick-capture draft save returned no note result'));
        return false;
      }

      clearQuickCaptureDraft();
      blinko.updateTicker++;
      return true;
    } catch (error) {
      notifyContinuationFailure(error);
      return false;
    }
  }, [blinko, clearQuickCaptureDraft, notifyContinuationFailure, store, toast]);

  const continueWithTargetNote = useCallback(async (targetNote?: Pick<Note, 'id'> | null) => {
    const noteId = targetNote?.id;
    if (!noteId) {
      toast.error('未找到可续写的笔记');
      return;
    }

    const shouldProtectDraft = hasQuickCaptureDraft({
      content: store.vditor?.getValue() ?? '',
      filesCount: store.files.length,
      referencesCount: store.references.length,
    });

    if (!shouldProtectDraft) {
      await openContinuationEditor(noteId);
      return;
    }

    showTipsDialog({
      size: 'md',
      title: '续写',
      content: '当前速记内容未保存，是否先保存再续写？',
      buttonSlot: <>
        <Button className="ml-auto" color='default' onPress={() => {
          dialogStandalone.close();
        }}>{t('cancel')}</Button>
        <Button color='default' onPress={async () => {
          clearQuickCaptureDraft();
          dialogStandalone.close();
          await openContinuationEditor(noteId);
        }}>替换</Button>
        <Button color='primary' onPress={async () => {
          const saved = await saveQuickCaptureDraft();
          if (!saved) {
            return;
          }

          dialogStandalone.close();
          await openContinuationEditor(noteId);
        }}>保存并续写</Button>
      </>,
    });
  }, [clearQuickCaptureDraft, dialogStandalone, openContinuationEditor, saveQuickCaptureDraft, store, t, toast]);

  const handleContinueWriting = useCallback(async () => {
    try {
      const recentNotes = await api.notes.list.mutate(getQuickCaptureRecentNotesInput());
      await continueWithTargetNote(recentNotes[0]);
    } catch (error) {
      notifyContinuationFailure(error);
    }
  }, [continueWithTargetNote, notifyContinuationFailure]);

  const handleOpenRecentNotes = useCallback(() => {
    dialogStandalone.setData({
      isOpen: true,
      size: 'lg',
      title: '续写历史',
      content: <QuickCaptureRecentNoteSelector onSelect={(note) => {
        dialogStandalone.close();
        void continueWithTargetNote(note);
      }} />,
    });
  }, [continueWithTargetNote, dialogStandalone]);

  const handleQuickCaptureAction = useCallback((action: QuickCaptureEditorAction) => {
    if (action === QUICK_CAPTURE_EDITOR_ACTION.timestamp) {
      eventBus.emit('editor:insert', formatQuickCaptureTimestamp());
      eventBus.emit('editor:focus');
      return;
    }

    if (action === QUICK_CAPTURE_EDITOR_ACTION.continueWriting) {
      void handleContinueWriting();
    }
  }, [handleContinueWriting]);

  useEffect(() => {
    if (!showQuickCaptureToolbar) {
      return;
    }

    eventBus.on('editor:quickCaptureAction', handleQuickCaptureAction);

    return () => {
      eventBus.off('editor:quickCaptureAction', handleQuickCaptureAction);
    };
  }, [handleQuickCaptureAction, showQuickCaptureToolbar]);

  return {
    handleOpenRecentNotes,
  };
};
