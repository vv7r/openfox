import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Attachment } from '@shared/types.js'
import { t } from '../i18n'
import { formatFileSize, getFileExtension, isPreviewableImage, isTextMime } from '../lib/attachment-utils'
import { useApp } from '../store/app'
import { useFeed } from '../store/feed'
import styles from './Feed.module.css'

const PREVIEW_CHARS = 200

/** The server reports a fallback on the user message or on the reply that consumed the image. */
function useFallback(messageId: string, attachmentId: string) {
  const replyId = useFeed((state) => {
    const start = state.ids.indexOf(messageId)
    return state.ids.slice(start + 1).find((id) => state.byId[id]?.role === 'assistant')
  })
  return useApp(
    (state) =>
      state.visionFallbacks[`${messageId}-${attachmentId}`] ?? state.visionFallbacks[`${replyId}-${attachmentId}`],
  )
}

function shorten(text: string): string {
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text
}

function ImageAttachment({ attachment, messageId }: { attachment: Attachment; messageId: string }) {
  const [zoomed, setZoomed] = useState(false)
  const fallback = useFallback(messageId, attachment.id)
  const describing = fallback?.type === 'start'
  const described = fallback?.type === 'done' ? fallback.description : undefined
  const alt = described ?? attachment.description ?? attachment.filename
  return (
    <div className={styles.imageAttachment}>
      <button type="button" title={alt} disabled={describing} onClick={() => setZoomed(true)}>
        <img src={attachment.data} alt={alt} />
        {describing && (
          <span className={styles.imageBusy}>{t({ en: 'Describing image…', fr: 'Description de l’image…' })}</span>
        )}
      </button>
      {described && <p className={styles.imageCaption}>{shorten(described)}</p>}
      <Dialog.Root open={zoomed} onOpenChange={setZoomed}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.imageOverlay} />
          <Dialog.Content className={styles.imageZoom} aria-describedby={undefined} onClick={() => setZoomed(false)}>
            <Dialog.Title className={styles.srOnly}>{t({ en: 'Attached image', fr: 'Image jointe' })}</Dialog.Title>
            <img src={attachment.data} alt={alt} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function FileAttachment({ attachment }: { attachment: Attachment }) {
  return (
    <div className={styles.fileAttachment}>
      <span className={styles.fileExtension}>{getFileExtension(attachment.filename)}</span>
      <span className={styles.fileDetails}>
        <span className={styles.truncate} title={attachment.filename}>
          {attachment.filename}
        </span>
        <small>{formatFileSize(attachment.size)}</small>
        {isTextMime(attachment.mimeType) && attachment.data && <code>{shorten(attachment.data)}</code>}
      </span>
    </div>
  )
}

export default function MessageAttachments({
  attachments,
  messageId,
}: {
  attachments: Attachment[]
  messageId: string
}) {
  return (
    <div className={styles.messageAttachments} data-testid="message-attachments">
      {attachments.map((attachment) =>
        isPreviewableImage(attachment.mimeType) ? (
          <ImageAttachment key={attachment.id} attachment={attachment} messageId={messageId} />
        ) : (
          <FileAttachment key={attachment.id} attachment={attachment} />
        ),
      )}
    </div>
  )
}
