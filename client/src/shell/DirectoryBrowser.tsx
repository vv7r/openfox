import { useState } from 'react'
import { getJson } from '../api'
import { t } from '../i18n'
import styles from './Shell.module.css'

interface Directory {
  current: string
  parent: string | null
  directories: Array<{ name: string; path: string }>
}

/** Folder picker: `browse('')` opens at the server's default, picks arrive through `onPath`. */
export function useDirectoryBrowser(onPath: (path: string) => void) {
  const [directory, setDirectory] = useState<Directory | null>(null)
  const browse = (target: string) => {
    void getJson<Directory>(`/api/directories${target ? `?path=${encodeURIComponent(target)}` : ''}`).then((found) => {
      setDirectory(found)
      onPath(found.current)
    })
  }
  return { directory, browse }
}

export function DirectoryList({ directory, browse }: { directory: Directory | null; browse: (path: string) => void }) {
  if (!directory) return null
  return (
    <div className={styles.browser}>
      {directory.parent && (
        <button type="button" onClick={() => browse(directory.parent!)}>
          {t({ en: 'Parent folder', fr: 'Dossier parent' })}
        </button>
      )}
      {directory.directories.map((item) => (
        <button key={item.path} type="button" onClick={() => browse(item.path)}>
          {item.name}
        </button>
      ))}
    </div>
  )
}
