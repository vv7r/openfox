import { spawn } from 'node:child_process'
import type { GitDiffFile } from '../../shared/protocol.js'
import type { PluginVcsContext } from '../../plugin/index.js'
import { gitSpawnEnv } from './env.js'
import { resolveVcsBranch, resolveVcsDiffFiles, resolveVcsModifiedFiles } from '../plugins/vcs-providers.js'

function toVcsContext(cwd: string, context?: { sessionId?: string; projectId?: string }): PluginVcsContext {
  return {
    workdir: cwd,
    ...(context?.sessionId !== undefined ? { sessionId: context.sessionId } : {}),
    ...(context?.projectId !== undefined ? { projectId: context.projectId } : {}),
  }
}

/** A git command's stdout, or null when it failed or could not start. */
function captureGit(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd,
      env: gitSpawnEnv(),
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
    let stdout = ''
    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    proc.on('close', (code) => resolve(code === 0 ? stdout : null))
    proc.on('error', () => resolve(null))
  })
}

async function readLineCounts(cwd: string): Promise<Map<string, { additions: number; deletions: number }>> {
  const counts = new Map<string, { additions: number; deletions: number }>()
  const stdout = await captureGit(cwd, ['diff', '--ignore-submodules=none', '--numstat', 'HEAD'])
  for (const line of stdout?.split('\n') ?? []) {
    // Binary files report "-" for both counts
    const match = /^(\d+)\t(\d+)\t(.+)$/.exec(line)
    if (match) counts.set(match[3]!, { additions: Number(match[1]), deletions: Number(match[2]) })
  }
  return counts
}

async function nativeGetGitDiffFiles(cwd: string): Promise<GitDiffFile[]> {
  const [files, counts] = await Promise.all([listChangedFiles(cwd), readLineCounts(cwd)])
  return files.map((file) => ({ ...file, ...counts.get(file.path) }))
}

function listChangedFiles(cwd: string): Promise<GitDiffFile[]> {
  return new Promise((resolve) => {
    const env = gitSpawnEnv()
    const diffProc = spawn('git', ['diff', '--ignore-submodules=none', '--name-status', 'HEAD'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const statusProc = spawn('git', ['status', '--porcelain', '--ignore-submodules=none'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let diffStdout = ''
    let statusStdout = ''
    let diffExited = false
    let statusExited = false
    let diffCode: number | null = null
    let statusCode: number | null = null

    const collect = () => {
      if (!diffExited || !statusExited) return

      const files: GitDiffFile[] = []

      if (diffCode === 0) {
        for (const line of diffStdout.split('\n')) {
          if (!line.trim()) continue
          const [statusChar, ...pathParts] = line.split('\t')
          const path = pathParts.join('\t') || statusChar || ''
          if (!path) continue
          const status = statusChar === 'A' ? 'added' : statusChar === 'D' ? 'deleted' : 'modified'
          files.push({ path, status, additions: 0, deletions: 0 })
        }
      }

      if (statusCode === 0) {
        for (const line of statusStdout.split('\n')) {
          if (!line.startsWith('?? ')) continue
          const path = line.slice(3).trim()
          if (!path) continue
          files.push({ path, status: 'added', additions: 0, deletions: 0 })
        }
      }

      resolve(files)
    }

    diffProc.stdout.on('data', (data: Buffer) => {
      diffStdout += data.toString()
    })
    statusProc.stdout.on('data', (data: Buffer) => {
      statusStdout += data.toString()
    })

    diffProc.on('close', (code) => {
      diffExited = true
      diffCode = code
      collect()
    })
    statusProc.on('close', (code) => {
      statusExited = true
      statusCode = code
      collect()
    })
    diffProc.on('error', () => {
      diffExited = true
      diffCode = 1
      collect()
    })
    statusProc.on('error', () => {
      statusExited = true
      statusCode = 1
      collect()
    })
  })
}

export async function getGitDiffFiles(
  cwd: string,
  context?: { sessionId?: string; projectId?: string },
): Promise<GitDiffFile[]> {
  const pluginDiffFiles = await resolveVcsDiffFiles(toVcsContext(cwd, context))

  if (pluginDiffFiles !== null) {
    return pluginDiffFiles.map((file) => ({
      path: file.path,
      status: file.status,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    }))
  }

  return nativeGetGitDiffFiles(cwd)
}

export async function formatGitDiffFiles(
  cwd: string,
  context?: { sessionId?: string; projectId?: string },
): Promise<string> {
  const pluginFormatted = await resolveVcsModifiedFiles(toVcsContext(cwd, context))

  if (pluginFormatted !== null) {
    return pluginFormatted
  }

  const files = await getGitDiffFiles(cwd, context)
  if (files.length === 0) return '(none)'
  return files.map((f) => `- ${f.path} (${f.status})`).join('\n')
}

export async function nativeGetGitBranch(cwd: string): Promise<string | null> {
  const stdout = await captureGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return stdout?.trim() || null
}

export async function getGitBranch(
  cwd: string,
  context?: { sessionId?: string; projectId?: string },
): Promise<string | null> {
  const pluginBranch = await resolveVcsBranch(toVcsContext(cwd, context))

  if (pluginBranch !== undefined) {
    return pluginBranch
  }

  return nativeGetGitBranch(cwd)
}
