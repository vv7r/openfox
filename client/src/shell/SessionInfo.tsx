import { useState, type ReactNode } from 'react'
import { getLocale } from '@shared/i18n/index.js'
import type { ContextPreviewPayload, DiffLine } from '@shared/protocol.js'
import type { MetadataEntry } from '@shared/types.js'
import { applyDynamicContext, compactContext, previewDynamicContext } from '../controller'
import { t } from '../i18n'
import { formatTokens } from '../lib/format-stats'
import panelStyles from '../panels/Panels.module.css'
import { useRoute } from '../router'
import { useApp } from '../store/app'
import { Criteria } from './Criteria'
import { SessionStatsView, StatCard, useMergedStats } from './SessionStatsView'
import dialogStyles from './AgentDialogs.module.css'
import styles from './Session.module.css'

const NO_ENTRIES: MetadataEntry[] = []

function ContextWindow() {
  const context = useApp((state) => state.context)
  const running = useApp((state) => state.session?.isRunning === true)
  if (!context) return null
  const percent = Math.round((context.currentTokens / context.maxTokens) * 100)
  return (
    <section className={styles.gauge} data-danger={context.dangerZone || undefined} data-testid="context-gauge">
      <div className={styles.gaugeLabel}>
        <h3 className={styles.eyebrow}>{t({ en: 'Context window', fr: 'Fenêtre de contexte' })}</h3>
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
      {context.dangerZone && (
        <p className={styles.danger}>{t({ en: 'The context is almost full', fr: 'Le contexte est presque plein' })}</p>
      )}
      <div className={`${dialogStyles.cards} ${styles.gaugeCards}`}>
        <StatCard
          label={t({ en: 'Used', fr: 'Utilisé' })}
          value={formatTokens(context.currentTokens)}
          detail={`${percent}%`}
        />
        <StatCard
          label={t({ en: 'Remaining', fr: 'Restant' })}
          value={formatTokens(Math.max(0, context.maxTokens - context.currentTokens))}
        />
        <StatCard label={t({ en: 'Maximum', fr: 'Maximum' })} value={formatTokens(context.maxTokens)} />
        <StatCard label={t({ en: 'Compactions', fr: 'Compressions' })} value={String(context.compactionCount)} />
        {context.warmCache !== undefined && (
          <StatCard
            label={t({ en: 'Prompt cache', fr: 'Cache du prompt' })}
            value={context.warmCache ? t({ en: 'Warm', fr: 'Chaud' }) : t({ en: 'Cold', fr: 'Froid' })}
          />
        )}
      </div>
    </section>
  )
}

function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className={styles.diff}>
      {lines.map((line, index) => (
        <span key={index} data-type={line.type}>
          {`${line.content}\n`}
        </span>
      ))}
    </pre>
  )
}

function SystemPrompt() {
  const changed = useApp((state) => state.context?.dynamicContextChanged === true)
  const running = useApp((state) => state.session?.isRunning === true)
  const [preview, setPreview] = useState<ContextPreviewPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    setFailed(false)
    void previewDynamicContext().then((result) => {
      setPreview(result)
      setFailed(result === null)
      setLoading(false)
    })
  }
  const toolDiff = preview?.toolDiff ?? []
  const hasDiff = (preview?.diff.length ?? 0) > 0 || toolDiff.length > 0

  return (
    <section data-testid="system-prompt">
      <h3 className={styles.eyebrow}>{t({ en: 'System prompt', fr: 'Prompt système' })}</h3>
      {!changed ? (
        <p className={styles.nothing}>{t({ en: 'Up to date', fr: 'À jour' })}</p>
      ) : (
        <div className={styles.promptChange}>
          <p className={styles.danger}>
            {t({
              en: 'Tools, skills or instructions changed since this prompt was cached. Updating it may slow the next response while the LLM reprocesses the prefix.',
              fr: 'Des outils, compétences ou instructions ont changé depuis la mise en cache de ce prompt. Le mettre à jour peut ralentir la prochaine réponse, le temps que le LLM retraite le préfixe.',
            })}
          </p>
          <div className={panelStyles.row}>
            <button type="button" data-testid="prompt-preview" disabled={loading} onClick={load}>
              {t({ en: 'See the changes', fr: 'Voir les changements' })}
            </button>
            <button
              type="button"
              className={panelStyles.primary}
              data-testid="prompt-apply"
              disabled={running}
              onClick={applyDynamicContext}
            >
              {t({ en: 'Update', fr: 'Mettre à jour' })}
            </button>
            {running && (
              <span className={panelStyles.muted}>
                {t({ en: 'Available once the run ends', fr: 'Disponible à la fin de l’exécution' })}
              </span>
            )}
          </div>
          {failed && (
            <p className={panelStyles.error}>
              {t({ en: 'No answer from the server', fr: 'Pas de réponse du serveur' })}
            </p>
          )}
          {preview && !hasDiff && (
            <p className={styles.nothing}>
              {t({
                en: 'The prompt text is identical: only its cached version would be rebuilt.',
                fr: 'Le texte du prompt est identique : seule sa version en cache serait reconstruite.',
              })}
            </p>
          )}
          {preview && preview.diff.length > 0 && <DiffLines lines={preview.diff} />}
          {toolDiff.length > 0 && (
            <>
              <h3 className={styles.eyebrow}>{t({ en: 'Tools', fr: 'Outils' })}</h3>
              <DiffLines lines={toolDiff} />
            </>
          )}
        </div>
      )}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

const dateTime = (iso: string) => new Date(iso).toLocaleString(getLocale())

function SessionFacts() {
  const session = useApp((state) => state.session)
  const defaultModel = useApp((state) => state.model)
  const providers = useApp((state) => state.providers)
  const git = useApp((state) => state.git)
  if (!session) return null
  const provider = providers.find((item) => item.id === session.providerId) ?? providers.find((item) => item.isActive)
  const effort = session.providerPinnedEffort ?? session.providerReasoningEffort
  const branch = git?.branch ?? session.branch
  const changed = git?.diff.files.length ?? 0
  return (
    <section>
      <h3 className={styles.eyebrow}>{t({ en: 'Session', fr: 'Session' })}</h3>
      <dl className={styles.facts} data-testid="session-facts">
        <Fact label={t({ en: 'Model', fr: 'Modèle' })}>{session.providerModel ?? defaultModel}</Fact>
        {provider && <Fact label={t({ en: 'Provider', fr: 'Fournisseur' })}>{provider.name}</Fact>}
        {effort && <Fact label={t({ en: 'Reasoning effort', fr: 'Effort de réflexion' })}>{effort}</Fact>}
        <Fact label={t({ en: 'Agent', fr: 'Agent' })}>{session.mode}</Fact>
        <Fact label={t({ en: 'Phase', fr: 'Phase' })}>{session.phase}</Fact>
        <Fact label={t({ en: 'Permissions', fr: 'Autorisations' })}>
          {session.dangerLevel === 'dangerous'
            ? t({ en: 'Dangerous', fr: 'Dangereux' })
            : t({ en: 'Normal', fr: 'Normal' })}
        </Fact>
        {branch && <Fact label={t({ en: 'Branch', fr: 'Branche' })}>{branch}</Fact>}
        <Fact label={t({ en: 'Modified files', fr: 'Fichiers modifiés' })}>{changed}</Fact>
        <Fact label={t({ en: 'Folder', fr: 'Dossier' })}>{session.workspace ?? session.workdir}</Fact>
        <Fact label={t({ en: 'Created', fr: 'Créée' })}>{dateTime(session.createdAt)}</Fact>
        <Fact label={t({ en: 'Updated', fr: 'Mise à jour' })}>{dateTime(session.updatedAt)}</Fact>
      </dl>
    </section>
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

const useCriteria = () => useApp((state) => state.session?.metadataEntries?.['criteria'] ?? NO_ENTRIES)

export function ContextView() {
  const { sessionId } = useRoute()
  const hasContext = useApp((state) => state.context !== null)
  const hasStats = useMergedStats() !== null
  return (
    <div className={`${panelStyles.body} ${styles.view}`} data-testid="context-view">
      {!hasContext && !hasStats && (
        <p className={styles.nothing}>{t({ en: 'Nothing to show yet', fr: 'Rien à afficher pour l’instant' })}</p>
      )}
      <ContextWindow />
      <SystemPrompt />
      <SessionFacts />
      <OtherMetadata />
      <SessionStatsView key={sessionId} />
    </div>
  )
}

export function CriteriaView() {
  return (
    <div className={styles.view} data-testid="criteria-view">
      <Criteria entries={useCriteria()} />
    </div>
  )
}
