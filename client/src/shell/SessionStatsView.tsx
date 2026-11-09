import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { getLocale } from '@shared/i18n/index.js'
import { buildPerformanceChartData, buildResponseLogRows, type ResponseLogRow } from '@shared/stats-view.js'
import type { CallStatsDataPoint, SessionStats } from '@shared/types.js'
import { getJson } from '../api'
import { t } from '../i18n'
import { copyToClipboard } from '../lib/clipboard'
import { formatSpeed, formatTime } from '../lib/format-stats'
import panelStyles from '../panels/Panels.module.css'
import { PluginZone } from '../plugins/Slots'
import { useRoute } from '../router'
import { useMergedStats } from './SessionBlock'
import { SpeedChart } from './SpeedChart'
import { compactTokens, contextRange, statsExport } from './statsView'
import styles from './AgentDialogs.module.css'

/** Above this, the full response log only loads on request. */
const AUTO_LOAD_RESPONSES = 50

const clock = (iso: string) => new Date(iso).toLocaleTimeString(getLocale(), { hour12: false })
const rate = (value: number) => `${formatSpeed(value)} t/s`

export function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className={styles.card}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

function ResponseRow({
  row,
  open,
  onToggle,
}: {
  row: ResponseLogRow
  open: boolean
  onToggle: (() => void) | undefined
}) {
  const context =
    row.calls.length > 0 ? contextRange(row.calls.map((call) => call.promptTokens)) : compactTokens(row.prefillTokens)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <tr data-testid="stats-response" data-clickable={onToggle ? true : undefined} onClick={onToggle}>
      <td>{row.responseIndex}</td>
      <td>{clock(row.timestamp)}</td>
      <td>{formatTime(row.totalTime)}</td>
      <td>{context}</td>
      <td>{rate(row.prefillSpeed)}</td>
      <td>{rate(row.generationSpeed)}</td>
      <td>{row.callCount}</td>
      <td>{onToggle && <Chevron size={12} />}</td>
    </tr>
  )
}

function CallRow({ call }: { call: CallStatsDataPoint }) {
  const params = [
    call.temperature !== undefined && `temp: ${call.temperature.toFixed(2)}`,
    call.topP !== undefined && `topP: ${call.topP.toFixed(2)}`,
    call.topK !== undefined && `topK: ${call.topK}`,
    call.maxTokens !== undefined && `maxTok: ${call.maxTokens}`,
  ].filter(Boolean)
  return (
    <>
      <tr data-call="">
        <td>{`c${call.callIndex}`}</td>
        <td>{clock(call.timestamp)}</td>
        <td>{formatTime(call.totalTime)}</td>
        <td>{compactTokens(call.promptTokens)}</td>
        <td>{rate(call.prefillSpeed)}</td>
        <td>{rate(call.generationSpeed)}</td>
        <td>{call.callIndex}</td>
        <td />
      </tr>
      {params.length > 0 && (
        <tr data-call="">
          <td className={styles.params} colSpan={8}>
            {params.join(' · ')}
          </td>
        </tr>
      )}
    </>
  )
}

export function SessionStatsView() {
  const { sessionId } = useRoute()
  const summary = useMergedStats()
  const content = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modelKey, setModelKey] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const responseCount = summary?.responseCount ?? 0
  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await getJson<{ stats: SessionStats | null }>(`/api/sessions/${sessionId}/stats`)
      setFull(data.stats)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const autoLoad = responseCount > 0 && responseCount <= AUTO_LOAD_RESPONSES
  useEffect(() => {
    if (autoLoad) void load()
    // Once per opening: a running session must not refetch on every live update
  }, [autoLoad])

  const groups = full?.modelGroups ?? summary?.modelGroups ?? []
  const group = groups.find((item) => item.key === modelKey) ?? groups[0]
  const detail = full?.modelGroups.find((item) => item.key === group?.key)
  const rows = useMemo(() => (detail ? buildResponseLogRows(detail) : []), [detail])
  const chart = useMemo(() => (detail ? buildPerformanceChartData(detail) : null), [detail])

  const copyJson = () => {
    if (detail) void copyToClipboard(JSON.stringify(statsExport(detail), null, 2))
  }

  const savePng = async () => {
    if (!content.current) return
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(content.current, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        scale: 2,
      })
      const link = document.createElement('a')
      link.download = `openfox-stats-${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch {
      copyJson()
    }
  }

  if (!sessionId) return null
  if (!group)
    return <p className={panelStyles.muted}>{t({ en: 'No stats yet', fr: 'Aucune statistique pour le moment' })}</p>

  const xLabel =
    chart?.xLabel === 'context' ? t({ en: 'context', fr: 'contexte' }) : t({ en: 'response', fr: 'réponse' })

  return (
    <PluginZone id="stats.modal" context={{ sessionId }}>
      <div ref={content} className={panelStyles.stack} data-testid="session-stats-view">
        {groups.length > 1 && (
          <div className={styles.chips}>
            {groups.map((item) => (
              <button
                key={item.key}
                type="button"
                className={styles.chip}
                aria-pressed={item.key === group.key}
                onClick={() => setModelKey(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <section>
          <h3 className={panelStyles.eyebrow}>{t({ en: 'Summary', fr: 'Résumé' })}</h3>
          <div className={styles.cards}>
            <StatCard label={t({ en: 'AI time', fr: 'Temps IA' })} value={formatTime(group.aiTime)} />
            <StatCard label={t({ en: 'Total time', fr: 'Temps total' })} value={formatTime(group.totalTime)} />
            <StatCard label={t({ en: 'Tool time', fr: 'Temps outils' })} value={formatTime(group.toolTime)} />
            <StatCard label={t({ en: 'Responses', fr: 'Réponses' })} value={String(group.responseCount)} />
            <StatCard label={t({ en: 'LLM calls', fr: 'Appels LLM' })} value={String(group.llmCallCount)} />
            <StatCard
              label={t({ en: 'Prefill tokens', fr: 'Jetons de préremplissage' })}
              value={compactTokens(group.prefillTokens)}
              detail={`@ ${rate(group.avgPrefillSpeed)}`}
            />
            <StatCard
              label={t({ en: 'Generated tokens', fr: 'Jetons générés' })}
              value={compactTokens(group.generationTokens)}
              detail={`@ ${rate(group.avgGenerationSpeed)}`}
            />
          </div>
          <PluginZone id="stats.modal.summary" context={{ sessionId }} />
        </section>
        {!full && responseCount > 0 && !(autoLoad && loading) && (
          <section className={styles.deferred}>
            <p className={panelStyles.muted}>
              {t(
                {
                  en: 'The full response log is not loaded. Load it to see per-response and per-call details ({{responses}} responses, {{calls}} calls).',
                  fr: 'Le journal complet des réponses n’est pas chargé. Chargez-le pour voir le détail par réponse et par appel ({{responses}} réponses, {{calls}} appels).',
                },
                { responses: responseCount, calls: summary?.llmCallCount ?? 0 },
              )}
            </p>
            {loadError && <p className={panelStyles.error}>{loadError}</p>}
            <button type="button" disabled={loading} data-testid="stats-load" onClick={() => void load()}>
              {loading
                ? t({ en: 'Loading…', fr: 'Chargement…' })
                : t({ en: 'Load full stats', fr: 'Charger toutes les statistiques' })}
            </button>
          </section>
        )}
        {detail && chart && chart.points.length > 1 && (
          <section>
            <div className={panelStyles.row}>
              <h3 className={`${panelStyles.eyebrow} ${panelStyles.grow}`}>
                {t({ en: 'Performance', fr: 'Performances' })}
              </h3>
              <button type="button" data-testid="stats-copy" onClick={copyJson}>
                {t({ en: 'Copy JSON', fr: 'Copier le JSON' })}
              </button>
              <button type="button" onClick={() => void savePng()}>
                {t({ en: 'Save PNG', fr: 'Enregistrer le PNG' })}
              </button>
            </div>
            <div className={styles.charts}>
              <SpeedChart
                title={t({ en: 'Prefill speed', fr: 'Vitesse d’entrée' })}
                xLabel={xLabel}
                data={chart.points.map((point) => ({ x: point.x, y: point.ppSpeed }))}
              />
              <SpeedChart
                title={t({ en: 'Output speed', fr: 'Vitesse de sortie' })}
                xLabel={xLabel}
                data={chart.points.map((point) => ({ x: point.x, y: point.tgSpeed }))}
              />
            </div>
          </section>
        )}
        {detail && (
          <section>
            <h3 className={panelStyles.eyebrow}>
              {t(
                { en: 'Response log ({{count}})', fr: 'Journal des réponses ({{count}})' },
                { count: detail.responseCount },
              )}
            </h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t({ en: 'No.', fr: 'N°' })}</th>
                    <th>{t({ en: 'At', fr: 'À' })}</th>
                    <th>{t({ en: 'Time', fr: 'Durée' })}</th>
                    <th>{t({ en: 'Context', fr: 'Contexte' })}</th>
                    <th>{t({ en: 'Prefill', fr: 'Entrée' })}</th>
                    <th>{t({ en: 'Output', fr: 'Sortie' })}</th>
                    <th>{t({ en: 'Calls', fr: 'Appels' })}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = expanded[row.messageId] === true
                    const onToggle = row.isExpandable
                      ? () => setExpanded((state) => ({ ...state, [row.messageId]: !open }))
                      : undefined
                    return (
                      <Fragment key={row.messageId}>
                        <ResponseRow row={row} open={open} onToggle={onToggle} />
                        {open &&
                          row.calls.map((call) => <CallRow key={`${call.messageId}-${call.callIndex}`} call={call} />)}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </PluginZone>
  )
}
