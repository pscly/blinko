import { api } from '@/lib/trpc';
import { getDisplayTime } from '@/lib/helper';
import type { Note } from '@shared/lib/types';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ScrollArea } from '../ScrollArea';
import type { EditorInitialData } from './type';

export const QUICK_CAPTURE_LONG_PRESS_MS = 500;

const padQuickCaptureNumber = (value: number) => String(value).padStart(2, '0');

export const formatQuickCaptureTimestamp = (date = new Date()) => {
  const year = date.getFullYear();
  const month = padQuickCaptureNumber(date.getMonth() + 1);
  const day = padQuickCaptureNumber(date.getDate());
  const hours = padQuickCaptureNumber(date.getHours());
  const minutes = padQuickCaptureNumber(date.getMinutes());
  const seconds = padQuickCaptureNumber(date.getSeconds());

  return `> ${year}-${month}-${day} ${hours}:${minutes}:${seconds}\n\n`;
};

export const hasQuickCaptureDraft = ({
  content = '',
  filesCount = 0,
  referencesCount = 0,
}: {
  readonly content?: string;
  readonly filesCount?: number;
  readonly referencesCount?: number;
}) => content.trim().length > 0 || filesCount > 0 || referencesCount > 0;

export const hasQuickCaptureIncomingSeed = (initialData?: EditorInitialData) => {
  const hasText = Boolean(initialData?.text?.trim());
  return hasText || Boolean(initialData?.file);
};

export const getQuickCaptureRecentNotesInput = () => ({
  page: 1,
  size: 20,
  orderBy: 'desc' as const,
  isArchived: false,
  isRecycle: false,
  searchText: '',
  editableOnly: true,
  recentOnly: true,
});

type QuickCaptureToolbarProps = {
  onTimestamp: () => void;
  onContinue: () => void;
  onContinueHistory: () => void;
};

type QuickCaptureDraftBannerProps = {
  readonly message: string;
  readonly onRestore: () => void;
  readonly onClear: () => void;
  readonly onUseIncoming?: () => void;
};

export const QuickCaptureDraftBanner = ({
  message,
  onRestore,
  onClear,
  onUseIncoming,
}: QuickCaptureDraftBannerProps) => {
  return <div data-testid="quick-capture-draft-banner" className='mb-2 flex w-full flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground'>
    <div className='font-medium text-warning'>检测到未保存的草稿</div>
    <div className='text-xs text-desc'>{message}</div>
    <div className='flex flex-wrap gap-2'>
      <button
        type="button"
        data-testid="quick-capture-restore-draft"
        className='min-h-8 rounded-md bg-background px-3 text-xs font-medium text-primary shadow-sm transition-transform active:scale-95'
        onClick={onRestore}
      >恢复草稿</button>
      {onUseIncoming && <button
        type="button"
        data-testid="quick-capture-use-incoming"
        className='min-h-8 rounded-md bg-background px-3 text-xs font-medium text-primary shadow-sm transition-transform active:scale-95'
        onClick={onUseIncoming}
      >使用新内容</button>}
      <button
        type="button"
        data-testid="quick-capture-clear-draft"
        className='min-h-8 rounded-md bg-background px-3 text-xs font-medium text-danger shadow-sm transition-transform active:scale-95'
        onClick={onClear}
      >清空草稿</button>
    </div>
  </div>;
};

export const QuickCaptureToolbar = ({
  onTimestamp,
  onContinue,
  onContinueHistory,
}: QuickCaptureToolbarProps) => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const startLongPress = () => {
    didLongPress.current = false;
    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onContinueHistory();
    }, QUICK_CAPTURE_LONG_PRESS_MS);
  };

  const finishLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    clearLongPressTimer();
    if (!didLongPress.current) {
      onContinue();
    }
    didLongPress.current = false;
  };

  const cancelLongPress = () => {
    clearLongPressTimer();
    didLongPress.current = false;
  };

  return <div data-testid="quick-capture-toolbar" className='flex w-full items-center gap-2 mb-2 rounded-lg border border-border bg-secondbackground px-2 py-1 text-xs text-foreground md:hidden'>
    <button type="button" className='min-h-8 rounded-md bg-background px-3 font-medium text-primary shadow-sm active:scale-95 transition-transform' onClick={onTimestamp}>时</button>
    <button
      type="button"
      className='min-h-8 rounded-md bg-background px-3 font-medium text-primary shadow-sm active:scale-95 transition-transform'
      onPointerDown={startLongPress}
      onPointerUp={finishLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={(event) => event.preventDefault()}
    >续写</button>
  </div>;
};

type QuickCaptureRecentNoteSelectorProps = {
  onSelect: (note: Note) => void;
};

export const QuickCaptureRecentNoteSelector = observer(({ onSelect }: QuickCaptureRecentNoteSelectorProps) => {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadRecentNotes = async () => {
      setIsLoading(true);
      try {
        const result = await api.notes.list.mutate(getQuickCaptureRecentNotesInput());
        if (isMounted) {
          setNotes(result);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error('Failed to load recent quick-capture notes:', error.message);
        } else {
          console.error('Failed to load recent quick-capture notes');
        }
        if (isMounted) {
          setNotes([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadRecentNotes();

    return () => {
      isMounted = false;
    };
  }, []);

  return <div className='w-full min-w-[280px] max-w-[360px]'>
    <div className='px-1 pb-2 text-sm font-medium text-foreground'>最近可续写笔记</div>
    {isLoading ? (
      <div className='px-2 py-4 text-sm text-desc'>{t('loading')}...</div>
    ) : notes.length === 0 ? (
      <div className='px-2 py-4 text-sm text-desc'>暂无可续写笔记</div>
    ) : (
      <ScrollArea className='max-h-[360px] flex flex-col gap-2' onBottom={() => {}}>
        {notes.map((item) => (
          <button
            key={item.id}
            type="button"
            className='w-full rounded-md bg-background px-3 py-2 text-left transition-colors hover:bg-hover'
            onClick={() => onSelect(item)}
          >
            <div className='text-xs text-desc'>{getDisplayTime(item.createdAt, item.updatedAt)}</div>
            <div className='mt-1 line-clamp-3 text-sm text-foreground'>{item.content?.trim() || t('note')}</div>
          </button>
        ))}
      </ScrollArea>
    )}
  </div>;
});
