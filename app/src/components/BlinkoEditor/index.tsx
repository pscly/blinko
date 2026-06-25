import { observer } from "mobx-react-lite"
import Editor from "../Common/Editor"
import { RootStore } from "@/store"
import { BlinkoStore } from "@/store/blinkoStore"
import { ToastPlugin } from "@/store/module/Toast/Toast"
import dayjs from "@/lib/dayjs"
import { useEffect, useRef } from "react"
import { NoteType } from "@shared/lib/types"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import type { EditorInitialData } from "../Common/Editor/type"
import {
  QuickCaptureDraftBanner,
} from "../Common/Editor/quickCaptureActions"
import { useQuickCaptureDraftGuard } from "../Common/Editor/useQuickCaptureDraftGuard"

type IProps = {
  mode: 'create' | 'edit',
  onSended?: () => void,
  onHeightChange?: (height: number) => void,
  height?: number,
  isInDialog?: boolean,
  withoutOutline?: boolean,
  initialData?: EditorInitialData,
  showTopToolbar?: boolean
}

export const BlinkoEditor = observer(({ mode, onSended, onHeightChange, isInDialog, withoutOutline, initialData, showTopToolbar = false }: IProps) => {
  const isCreateMode = mode === 'create'
  const blinko = RootStore.Get(BlinkoStore)
  const toast = RootStore.Get(ToastPlugin)
  const editorRef = useRef<any>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const {
    draftBanner,
    resolvedInitialData,
  } = useQuickCaptureDraftGuard({
    mode,
    initialData,
  })

  const store = RootStore.Local(() => ({
    get noteContent() {
      if (isCreateMode) {
        try {
          const local = blinko.createContentStorage.value
          const blinkoContent = blinko.noteContent
          return local?.content !== '' ? local?.content : blinkoContent
        } catch (error) {
          return ''
        }
      } else {
        try {
          if (!blinko.curSelectedNote) return '';
          const local = blinko.editContentStorage.list?.find(i => Number(i.id) === Number(blinko.curSelectedNote?.id))
          const blinkoContent = blinko.curSelectedNote?.content ?? ''
          return local?.content !== '' ? (local?.content ?? blinkoContent) : blinkoContent
        } catch (error) {
          return ''
        }
      }
    },
    set noteContent(v: string) {
      if (isCreateMode) {
        try {
          blinko.noteContent = v
          blinko.createContentStorage.save({ content: v })
        } catch (error) {
          console.error(error)
        }
      } else {
        try {
          if (!blinko.curSelectedNote) return;
          blinko.curSelectedNote.content = v
          const hasLocal = blinko.editContentStorage.list?.find(i => Number(i.id) === Number(blinko.curSelectedNote?.id))
          if (hasLocal) {
            hasLocal.content = v
            blinko.editContentStorage.save()
          } else {
            blinko.editContentStorage.push({ content: v, id: Number(blinko.curSelectedNote.id) })
          }
        } catch (error) {
          console.error(error)
        }
      }
    },
    get files(): any {
      if (mode === 'create') {
        const attachments = blinko.createAttachmentsStorage.list
        if (attachments.length) {
          return (attachments)
        } else {
          return []
        }
      } else {
        return blinko.curSelectedNote?.attachments
        // const attachments = blinko.editAttachmentsStorage.list.filter(i => Number(i.id) == Number(blinko.curSelectedNote!.id))
        // if (attachments?.length) {
        //   return attachments
        // } else {
        //   return blinko.curSelectedNote?.attachments
        // }
      }
    }
  }))

  useEffect(() => {
    blinko.isCreateMode = mode === 'create'
    if (mode === 'create') {
      if (isInDialog) {
        document.documentElement.style.setProperty('--min-editor-height', `50vh`)
      }
      const local = blinko.createContentStorage.value
      if (local && local.content !== '') {
        blinko.noteContent = local.content
      }
    } else {
      document.documentElement.style.setProperty('--min-editor-height', `unset`)
      try {
        if (!blinko.curSelectedNote) return;
        const local = blinko.editContentStorage.list?.find(i => Number(i.id) === Number(blinko.curSelectedNote?.id))
        if (local && local?.content !== '') {
          blinko.curSelectedNote.content = local.content
        }
      } catch (error) {
        console.error(error)
      }
    }
  }, [blinko, blinko.curSelectedNote, isInDialog, mode])

  // Use Tauri hotkey hook
  return <div className={`h-full flex flex-col ${withoutOutline ? '' : ''}`} ref={editorRef} id='global-editor' data-tauri-drag-region>
    {draftBanner && <QuickCaptureDraftBanner {...draftBanner} />}
    <Editor
      mode={mode}
      originFiles={store.files}
      originReference={!isCreateMode ? blinko.curSelectedNote?.references?.map(i => i.toNoteId) : []}
      content={store.noteContent}
      onChange={v => {
        store.noteContent = v
      }}
      withoutOutline={withoutOutline}
      initialData={resolvedInitialData}
      showTopToolbar={showTopToolbar}
      onHeightChange={() => {
        onHeightChange?.(editorRef.current?.clientHeight ?? 75)
        if (editorRef.current) {
          const editorElement = document.getElementById('global-editor');
          if (editorElement && editorElement.children[0]) {
            //@ts-ignore
            editorElement.__storeInstance = editorElement.children[0].__storeInstance;
          }
        }
      }}
      isSendLoading={blinko.upsertNote.loading.value}
      bottomSlot={
        isCreateMode ? <div className='text-xs text-ignore ml-2'>Drop to upload files</div> :
          blinko.curSelectedNote?.createdAt ? <div className='text-xs text-desc'>{dayjs(blinko.curSelectedNote.createdAt).format("YYYY-MM-DD hh:mm:ss")}</div> : null
      }
      onSend={async ({ files, references, noteType, metadata }) => {
        if (isCreateMode) {
          console.log("createMode", files, references, noteType, metadata)
          const savedNote = await blinko.upsertNote.call({
            type: noteType,
            references,
            refresh: false,
            content: blinko.noteContent,
            attachments: files.map(i => ({ name: i.name, path: i.uploadPath, size: i.size, type: i.type })),
            metadata,
          })
          if (!savedNote) {
            toast.error('保存失败，草稿已保留')
            return
          }
          blinko.createAttachmentsStorage.clear()
          blinko.createContentStorage.clear()
          if (blinko.noteTypeDefault === NoteType.NOTE && searchParams.get('path') !== 'notes') {
            await navigate('/?path=notes')
            blinko.forceQuery++
          }
          if (blinko.noteTypeDefault === NoteType.BLINKO && location.pathname !== '/') {
            await navigate('/')
            blinko.forceQuery++
          }
          blinko.updateTicker++
        } else {
          if (!blinko.curSelectedNote) return;
          const savedNote = await blinko.upsertNote.call({
            id: blinko.curSelectedNote.id,
            type: noteType,
            content: blinko.curSelectedNote.content,
            attachments: files.map(i => ({ name: i.name, path: i.uploadPath, size: i.size, type: i.type })),
            references,
            metadata,
            refresh: true // Ensure list is refreshed after update
          })
          if (!savedNote) {
            toast.error('保存失败，草稿已保留')
            return
          }
          try {
            const index = blinko.editAttachmentsStorage.list?.findIndex(i => i.id === blinko.curSelectedNote?.id)
            if (index !== undefined && index !== -1) {
              blinko.editAttachmentsStorage.remove(index)
              blinko.editContentStorage.remove(index)
            }
          } catch (error) {
            console.error(error)
          }
        }
        onSended?.()
      }} />
  </div>
})
