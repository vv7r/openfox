import {
  Bell,
  Bot,
  Brain,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Folder,
  GitBranch,
  Heart,
  Info,
  Pencil,
  Pin,
  Play,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Send,
  Settings,
  Square,
  Star,
  SquareTerminal,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  bell: Bell,
  check: Check,
  'check-circle': Check,
  'check-square': Check,
  download: Download,
  external: ExternalLink,
  'external-link': ExternalLink,
  folder: Folder,
  'folder-open': Folder,
  gear: Settings,
  settings: Settings,
  cog: Settings,
  info: Info,
  play: Play,
  'play-circle': Play,
  plus: Plus,
  'plus-circle': Plus,
  puzzle: Puzzle,
  refresh: RefreshCw,
  'refresh-cw': RefreshCw,
  'rotate-cw': RefreshCw,
  reload: RefreshCw,
  search: Search,
  star: Star,
  stop: Square,
  square: Square,
  'stop-circle': Square,
  terminal: SquareTerminal,
  console: SquareTerminal,
  prompt: SquareTerminal,
  trash: Trash2,
  'trash-2': Trash2,
  delete: Trash2,
  warning: TriangleAlert,
  alert: TriangleAlert,
  'alert-triangle': TriangleAlert,
  edit: Pencil,
  pencil: Pencil,
  eye: Eye,
  pin: Pin,
  send: Send,
  heart: Heart,
  copy: Copy,
  clipboard: Copy,
  branch: GitBranch,
  'git-branch': GitBranch,
  agent: Bot,
  bot: Bot,
  sparkles: Bot,
  brain: Brain,
  thinking: Brain,
}

/** A named icon, or the raw SVG path or markup a plugin (trusted, in-process) supplied. */
export function PluginIcon({ name, size = 14 }: { name: string | undefined; size?: number }) {
  const trimmed = name?.trim() ?? ''
  if (trimmed.startsWith('<svg'))
    return (
      <span
        style={{ display: 'inline-flex', width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: trimmed }}
      />
    )
  if (/^[Mm]\s*[\d.-]/.test(trimmed)) {
    return (
      <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={trimmed} />
      </svg>
    )
  }
  const Icon = ICONS[trimmed.toLowerCase()] ?? Puzzle
  return <Icon size={size} />
}
