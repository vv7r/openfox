import type { MessageStats } from '@shared/types.js'
import { t } from '../i18n'
import { formatTime } from '../lib/format-stats'
import { useApp } from '../store/app'
import { StatCard } from './SessionStatsView'
import { compactTokens } from './statsView'
import styles from './AgentDialogs.module.css'

export function TurnStatsView({ stats }: { stats: MessageStats }) {
  const agent = useApp((state) => state.agents.find((candidate) => candidate.id === stats.mode))
  const model = stats.reasoningEffort ? `${stats.model}:${stats.reasoningEffort}` : stats.model
  return (
    <div data-testid="turn-stats">
      <p className={styles.subtitle}>{`${model} · ${agent?.name ?? stats.mode}`}</p>
      <div className={styles.cards}>
        <StatCard label={t({ en: 'Total time', fr: 'Temps total' })} value={formatTime(stats.totalTime)} />
        <StatCard label={t({ en: 'Prefill', fr: 'Préremplissage' })} value={compactTokens(stats.prefillTokens)} />
        <StatCard label={t({ en: 'Generated', fr: 'Généré' })} value={compactTokens(stats.generationTokens)} />
        <StatCard label={t({ en: 'LLM calls', fr: 'Appels LLM' })} value={String(stats.llmCalls?.length ?? 1)} />
      </div>
      {stats.llmCalls?.map((call, index) => (
        <div key={index} className={styles.call}>
          <div className={styles.callHeader}>
            <span>{t({ en: 'Call {{count}}', fr: 'Appel {{count}}' }, { count: index + 1 })}</span>
            <span>{`${call.ttft.toFixed(2)}s TTFT · ${call.completionTime.toFixed(2)}s gen`}</span>
          </div>
          <div className={styles.callBody}>
            <span>{`${t({ en: 'Tokens', fr: 'Jetons' })} ${call.promptTokens} → ${call.completionTokens}`}</span>
            {call.temperature !== undefined && <code>{`temp: ${call.temperature.toFixed(2)}`}</code>}
            {call.topP !== undefined && <code>{`topP: ${call.topP.toFixed(2)}`}</code>}
            {call.topK !== undefined && <code>{`topK: ${call.topK}`}</code>}
            {call.maxTokens !== undefined && <code>{`maxTok: ${call.maxTokens}`}</code>}
          </div>
        </div>
      ))}
    </div>
  )
}
