import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { mergeLiveStats } from '@shared/stats.js'
import type { MetadataEntry } from '@shared/types.js'
import { compactContext } from '../controller'
import { t } from '../i18n'
import { formatSpeed, formatTime, formatTokens } from '../lib/format-stats'
import { useApp } from '../store/app'
import { Criteria } from './Criteria'
import styles from './Session.module.css'

const STORAGE_KEY = 'openfox:session-block-open'
const NO_ENTRIES: MetadataEntry[] = []

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ContextGauge() {
  const context = useApp((state) => state.context)
  const running = useApp((state) => state.session?.isRunning === true)
  if (!context) return null
  const percent = Math.round((context.currentTokens / context.maxTokens) * 100)
  return (
    <div className={styles.gauge} data-danger={context.dangerZone || undefined} data-testid="context-gauge">
      <div className={styles.gaugeLabel}>
        <span>{`${formatTokens(context.currentTokens)} / ${formatTokens(context.maxTokens)} (${percent}%)`}</span>
        {context.compactionCount > 0 && <span className={styles.badge}>{`${context.compactionCount}x`}</span>}
        <button
          type="button"
          className={styles.textAction}
          disabled={running || !context.canCompact}
          onClick={compactContext}
        >
          {t({ en: 'Compact', fr: 'Compresser' })}
        </button>
      </div>
      <div className={styles.gaugeTrack}>
        <div style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  )
}

function Stats() {
  const base = useApp((state) => state.stats)
  const live = useApp((state) => state.liveStats)
  const stats = live ? mergeLiveStats(base, live) : base
  if (!stats) return null
  return (
    <div className={styles.stats} data-testid="session-stats">
      <Stat label={t({ en: 'AI time', fr: 'Temps IA' })} value={formatTime(stats.aiTime)} />
      <Stat label={t({ en: 'Tool time', fr: 'Temps outils' })} value={formatTime(stats.toolTime)} />
      <Stat label={t({ en: 'Input tokens', fr: 'Tokens entrée' })} value={formatTokens(stats.prefillTokens)} />
      <Stat label={t({ en: 'Output tokens', fr: 'Tokens sortie' })} value={formatTokens(stats.generationTokens)} />
      <Stat
        label={t({ en: 'Prefill speed', fr: 'Vitesse entrée' })}
        value={`${formatSpeed(stats.avgPrefillSpeed)} t/s`}
      />
      <Stat
        label={t({ en: 'Output speed', fr: 'Vitesse sortie' })}
        value={`${formatSpeed(stats.avgGenerationSpeed)} t/s`}
      />
      {stats.cachedPromptTokens !== undefined && (
        <Stat label={t({ en: 'Cached', fr: 'En cache' })} value={formatTokens(stats.cachedPromptTokens)} />
      )}
      <Stat label={t({ en: 'LLM calls', fr: 'Appels LLM' })} value={stats.llmCallCount} />
    </div>
  )
}

function OtherMetadata() {
  const entries = useApp((state) => state.session?.metadataEntries)
  if (!entries) return null
  const keys = Object.keys(entries).filter((key) => key !== 'criteria' && (entries[key]?.length ?? 0) > 0)
  return (
    <>
      {keys.map((key) => (
        <section key={key}>
          <h3 className={styles.eyebrow}>{key.replace(/_/g, ' ')}</h3>
          <ul className={styles.metadata}>
            {entries[key]!.map((entry) => (
              <li key={entry.id} data-status={entry.status}>
                {entry.description}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function Summary() {
  const context = useApp((state) => state.context)
  const criteria = useApp((state) => state.session?.metadataEntries?.['criteria'] ?? NO_ENTRIES)
  const done = criteria.filter((entry) => entry.status === 'passed').length
  return (
    <span className={styles.summary}>
      {context && <span>{`${Math.round((context.currentTokens / context.maxTokens) * 100)}%`}</span>}
      {criteria.length > 0 && <span>{`${done}/${criteria.length}`}</span>}
    </span>
  )
}

export function SessionBlock() {
  const [open, setOpen] = useState(readOpen)
  const criteria = useApp((state) => state.session?.metadataEntries?.['criteria'] ?? NO_ENTRIES)
  const Chevron = open ? ChevronDown : ChevronRight

  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(STORAGE_KEY, String(!open))
    } catch {
      // Back to the default next time
    }
  }

  return (
    <div className={styles.block} data-testid="session-block">
      <button type="button" className={styles.blockHeader} onClick={toggle}>
        <Chevron size={14} />
        <span className={styles.eyebrow}>{t({ en: 'Context & criteria', fr: 'Contexte et critères' })}</span>
        <Summary />
      </button>
      {open && (
        <div className={styles.blockBody}>
          <ContextGauge />
          <Stats />
          <section>
            <h3 className={styles.eyebrow}>{t({ en: 'Acceptance criteria', fr: 'Critères d’acceptation' })}</h3>
            <Criteria entries={criteria} />
          </section>
          <OtherMetadata />
        </div>
      )}
    </div>
  )
}
