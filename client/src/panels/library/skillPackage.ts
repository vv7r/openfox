import { t } from '../../i18n'

export interface SkillPackage {
  packageName: string
  files: Array<{ path: string; file: File }>
}

type Entry = FileSystemFileEntry | FileSystemDirectoryEntry

function validated(packageName: string, files: SkillPackage['files']): SkillPackage {
  if (!packageName || !files.some((entry) => entry.path === 'SKILL.md')) {
    throw new Error(
      t({ en: 'The folder must contain a SKILL.md file.', fr: 'Le dossier doit contenir un fichier SKILL.md.' }),
    )
  }
  return { packageName, files }
}

export function packageFromFileList(list: Iterable<File>): SkillPackage {
  const files = [...list]
  const roots = new Set(files.map((file) => file.webkitRelativePath.split('/')[0]).filter(Boolean))
  if (roots.size !== 1)
    throw new Error(t({ en: 'Choose exactly one skill folder.', fr: 'Choisissez un seul dossier de compétence.' }))
  const packageName = [...roots][0]!
  return validated(
    packageName,
    files.map((file) => ({ path: file.webkitRelativePath.slice(packageName.length + 1), file })),
  )
}

const readFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject))

async function readDirectory(directory: FileSystemDirectoryEntry, prefix = ''): Promise<SkillPackage['files']> {
  const reader = directory.createReader()
  const entries: Entry[] = []
  // readEntries returns its results in batches, until an empty one
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    entries.push(...(batch as Entry[]))
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      return entry.isDirectory
        ? readDirectory(entry as FileSystemDirectoryEntry, path)
        : [{ path, file: await readFile(entry as FileSystemFileEntry) }]
    }),
  )
  return nested.flat()
}

export async function packageFromDrop(data: DataTransfer): Promise<SkillPackage> {
  const entries = [...data.items]
    .filter((item) => item.kind === 'file')
    .flatMap((item) => item.webkitGetAsEntry() ?? [])
  const root = entries[0]
  if (entries.length !== 1 || !root?.isDirectory) {
    throw new Error(t({ en: 'Drop exactly one skill folder.', fr: 'Déposez un seul dossier de compétence.' }))
  }
  return validated(root.name, await readDirectory(root as FileSystemDirectoryEntry))
}
