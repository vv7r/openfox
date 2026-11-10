import { useState } from 'react'
import { REASONING_EFFORT_VALUES } from '@shared/reasoning-effort.js'
import { t } from '../../i18n'
import { formatTokens } from '../../lib/format-stats'
import { PluginZone } from '../../plugins/Slots'
import styles from '../Panels.module.css'
import {
  effortOverrideOf,
  isSmallContext,
  moveInList,
  toggleInList,
  type ModelInfo,
  type ModelSettings,
} from './wizard'

export type ProbeState = 'pending' | 'probing' | 'done' | 'error'
export type TestMode = 'thinking' | 'non-thinking'
export interface TestResult {
  loading: boolean
  result?: string
  error?: string
}

interface Props {
  model: ModelInfo
  settings: ModelSettings | undefined
  probe: ProbeState | undefined
  tests: Record<string, TestResult>
  onChange: (patch: Partial<ModelSettings>) => void
  onAutoConfig: () => void
  onTest: (mode: TestMode) => void
  onShowRaw: (text: string) => void
}

const MIN_COMPACTION_TOKENS = 15_000
const DEFAULT_THRESHOLD = 0.85

function TestButton({
  label,
  test,
  onRun,
  onShowRaw,
}: {
  label: string
  test: TestResult | undefined
  onRun: () => void
  onShowRaw: (text: string) => void
}) {
  const result = test?.result
  return (
    <span className={styles.row}>
      <button type="button" disabled={test?.loading} onClick={onRun}>
        {test?.loading ? t({ en: 'Testing…', fr: 'Test en cours…' }) : label}
      </button>
      {result && <span>{t({ en: 'OK', fr: 'OK' })}</span>}
      {test?.error && (
        <span className={styles.error} title={test.error}>
          {t({ en: 'Fail', fr: 'Échec' })}
        </span>
      )}
      {result && (
        <button type="button" onClick={() => onShowRaw(result)}>
          {t({ en: 'raw', fr: 'brut' })}
        </button>
      )}
    </span>
  )
}

function SamplingField({
  label,
  param,
  value,
  fallback,
  omitted,
  step,
  onValue,
  onOmit,
}: {
  label: string
  param: string
  value: number | undefined
  fallback: number | undefined
  omitted: boolean
  step?: number
  onValue: (value: number | undefined) => void
  onOmit: () => void
}) {
  return (
    <div className={styles.field}>
      <span className={styles.row}>
        <span className={styles.grow}>{label}</span>
        <label className={styles.check}>
          <input type="checkbox" data-testid={`send-${param}`} checked={!omitted} onChange={onOmit} />
          {t({ en: 'Send', fr: 'Envoyer' })}
        </label>
      </span>
      <input
        className={styles.input}
        type="number"
        data-testid={`param-${param}`}
        step={step}
        disabled={omitted}
        value={omitted ? '' : (value ?? '')}
        placeholder={
          omitted
            ? t({ en: 'Not sent', fr: 'Non envoyé' })
            : (fallback?.toString() ?? t({ en: 'Using default', fr: 'Valeur par défaut' }))
        }
        onChange={(event) => onValue(event.target.value ? Number(event.target.value) : undefined)}
      />
    </div>
  )
}

function Compaction({
  value,
  maxTokens,
  onChange,
}: {
  value: number | undefined
  maxTokens: number
  onChange: (threshold: number | undefined) => void
}) {
  const maxPercent = Math.min(95, Math.floor(((maxTokens - 5_000) / maxTokens) * 100))
  const minPercent = Math.min(maxPercent, Math.ceil((MIN_COMPACTION_TOKENS / maxTokens) * 100))
  const stored = Math.round(Math.min(value ?? DEFAULT_THRESHOLD, maxPercent / 100) * 100)
  const [dragging, setDragging] = useState<number | null>(null)
  const percent = dragging ?? stored
  const commit = () => {
    if (dragging === null) return
    onChange(dragging / 100)
    setDragging(null)
  }
  return (
    <div className={styles.field}>
      <span className={styles.row}>
        <span className={styles.grow}>{t({ en: 'Auto-compaction threshold', fr: 'Seuil d’auto-compaction' })}</span>
        <code>{`${percent}% · ${formatTokens(Math.floor(maxTokens * (percent / 100)))}`}</code>
        <button type="button" disabled={value === undefined} onClick={() => onChange(undefined)}>
          {t({ en: 'Default', fr: 'Défaut' })}
        </button>
      </span>
      <input
        type="range"
        aria-label={t({ en: 'Auto-compaction threshold', fr: 'Seuil d’auto-compaction' })}
        min={minPercent}
        max={maxPercent}
        value={percent}
        onChange={(event) => setDragging(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className={styles.muted}>
        {t(
          {
            en: 'Minimum {{min}} tokens, maximum {{max}}%, default 85%',
            fr: 'Minimum {{min}} tokens, maximum {{max}} %, défaut 85 %',
          },
          { min: formatTokens(MIN_COMPACTION_TOKENS), max: maxPercent },
        )}
      </span>
    </div>
  )
}

export function ModelSettingsPanel({
  model,
  settings,
  probe,
  tests,
  onChange,
  onAutoConfig,
  onTest,
  onShowRaw,
}: Props) {
  const contextWindow = settings?.contextWindow ?? model.contextWindow
  const omit = settings?.omitParams ?? []
  const presets = settings?.reasoningEfforts ?? model.reasoningEfforts ?? []

  const toggleOmit = (param: string) => {
    const next = toggleInList(omit, param)
    onChange({ omitParams: next.length > 0 ? next : undefined })
  }

  const queryParams = (key: 'thinkingQueryParams' | 'nonThinkingQueryParams') => (
    <label className={styles.field}>
      {t({ en: 'Query params (optional JSON)', fr: 'Paramètres de requête (JSON facultatif)' })}
      <input
        className={styles.input}
        value={settings?.[key] ?? ''}
        onChange={(event) => onChange({ [key]: event.target.value })}
      />
    </label>
  )

  return (
    <div className={styles.form} data-testid="model-settings">
      <div className={styles.row}>
        <button type="button" className={styles.primary} disabled={probe === 'probing'} onClick={onAutoConfig}>
          {probe === 'probing'
            ? t({ en: 'Probing…', fr: 'Analyse…' })
            : t({ en: 'Auto-config', fr: 'Auto-configuration' })}
        </button>
        {probe === 'done' && <span>{t({ en: 'Configured', fr: 'Configuré' })}</span>}
        {probe === 'error' && <span className={styles.error}>{t({ en: 'Failed', fr: 'Échec' })}</span>}
      </div>
      <label className={styles.field}>
        {t({ en: 'Context window (tokens)', fr: 'Fenêtre de contexte (tokens)' })}
        <input
          className={styles.input}
          type="number"
          data-testid="model-context"
          value={contextWindow}
          onChange={(event) => onChange({ contextWindow: Number(event.target.value) || model.contextWindow })}
        />
        {isSmallContext(contextWindow) && (
          <span className={styles.error}>
            {t({
              en: 'Small context: agent prompts may be truncated by the provider.',
              fr: 'Contexte réduit : les prompts de l’agent peuvent être tronqués par le fournisseur.',
            })}
          </span>
        )}
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={settings?.supportsVision ?? false}
          onChange={(event) => onChange({ supportsVision: event.target.checked })}
        />
        {t({ en: 'Supports vision', fr: 'Prend en charge la vision' })}
      </label>
      <div className={styles.row}>
        <TestButton
          label={t({ en: 'Test thinking', fr: 'Tester la réflexion' })}
          test={tests[`${model.id}-thinking`]}
          onRun={() => onTest('thinking')}
          onShowRaw={onShowRaw}
        />
        <TestButton
          label={t({ en: 'Test non-thinking', fr: 'Tester sans réflexion' })}
          test={tests[`${model.id}-non-thinking`]}
          onRun={() => onTest('non-thinking')}
          onShowRaw={onShowRaw}
        />
      </div>
      <details>
        <summary>{t({ en: 'Advanced: thinking and sampling', fr: 'Avancé : réflexion et échantillonnage' })}</summary>
        <div className={styles.form}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings?.thinkingEnabled ?? false}
              onChange={(event) => onChange({ thinkingEnabled: event.target.checked })}
            />
            {t({ en: 'Thinking', fr: 'Réflexion' })}
          </label>
          {settings?.thinkingEnabled && (
            <>
              <label className={styles.field}>
                {t({ en: 'Reasoning effort', fr: 'Niveau de raisonnement' })}
                {model.reasoningEfforts?.length ? (
                  <select
                    className={styles.select}
                    value={settings.thinkingLevel ?? ''}
                    onChange={(event) => onChange({ thinkingLevel: event.target.value })}
                  >
                    {model.reasoningEfforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={styles.input}
                    value={settings.thinkingLevel ?? ''}
                    onChange={(event) => onChange({ thinkingLevel: event.target.value })}
                  />
                )}
              </label>
              {queryParams('thinkingQueryParams')}
            </>
          )}
          <div className={styles.field}>
            {t({
              en: 'Effort presets shown in the model selector',
              fr: 'Préréglages d’effort affichés dans le sélecteur',
            })}
            <div className={styles.row}>
              {presets.map((effort, index) => (
                <span key={effort} className={styles.row}>
                  {effort}
                  <button
                    type="button"
                    aria-label={t({ en: 'Move up {{effort}}', fr: 'Monter {{effort}}' }, { effort })}
                    disabled={index === 0}
                    onClick={() => onChange({ reasoningEfforts: moveInList(presets, index, -1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t({ en: 'Move down {{effort}}', fr: 'Descendre {{effort}}' }, { effort })}
                    disabled={index === presets.length - 1}
                    onClick={() => onChange({ reasoningEfforts: moveInList(presets, index, 1) })}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={t({ en: 'Remove {{effort}}', fr: 'Retirer {{effort}}' }, { effort })}
                    onClick={() => onChange({ reasoningEfforts: toggleInList(presets, effort) })}
                  >
                    ×
                  </button>
                </span>
              ))}
              <select
                className={styles.select}
                aria-label={t({ en: 'Add effort preset', fr: 'Ajouter un préréglage' })}
                value=""
                onChange={(event) =>
                  event.target.value && onChange({ reasoningEfforts: toggleInList(presets, event.target.value) })
                }
              >
                <option value="">{t({ en: 'Add preset…', fr: 'Ajouter un préréglage…' })}</option>
                {REASONING_EFFORT_VALUES.filter((value) => !presets.includes(value)).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              {settings?.reasoningEfforts !== undefined && (
                <button type="button" onClick={() => onChange({ reasoningEfforts: undefined })}>
                  {t({ en: 'Reset to defaults', fr: 'Réinitialiser' })}
                </button>
              )}
            </div>
          </div>
          <label className={styles.field}>
            {t({ en: 'Reasoning effort override (sent verbatim)', fr: 'Remplacement de l’effort (envoyé tel quel)' })}
            <input
              className={styles.input}
              value={effortOverrideOf(model, settings) ?? ''}
              onChange={(event) => onChange({ reasoningEffortOverride: event.target.value || undefined })}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={settings?.nonThinkingEnabled ?? false}
              onChange={(event) => onChange({ nonThinkingEnabled: event.target.checked })}
            />
            {t({ en: 'Non-thinking', fr: 'Sans réflexion' })}
          </label>
          {settings?.nonThinkingEnabled && queryParams('nonThinkingQueryParams')}
          {omit.includes('reasoning_effort') && (
            <label className={styles.check}>
              <input type="checkbox" checked={false} onChange={() => toggleOmit('reasoning_effort')} />
              {t({ en: 'Re-enable reasoning_effort', fr: 'Réactiver reasoning_effort' })}
            </label>
          )}
          <span className={styles.eyebrow}>{t({ en: 'Sampling parameters', fr: 'Paramètres d’échantillonnage' })}</span>
          <SamplingField
            label={t({ en: 'Temperature', fr: 'Température' })}
            param="temperature"
            step={0.1}
            value={settings?.temperature}
            fallback={settings?.defaultTemperature}
            omitted={omit.includes('temperature')}
            onValue={(temperature) => onChange({ temperature })}
            onOmit={() => toggleOmit('temperature')}
          />
          <SamplingField
            label={t({ en: 'Top P', fr: 'Top P' })}
            param="top_p"
            step={0.05}
            value={settings?.topP}
            fallback={settings?.defaultTopP}
            omitted={omit.includes('top_p')}
            onValue={(topP) => onChange({ topP })}
            onOmit={() => toggleOmit('top_p')}
          />
          <SamplingField
            label={t({ en: 'Top K', fr: 'Top K' })}
            param="top_k"
            value={settings?.topK}
            fallback={settings?.defaultTopK}
            omitted={omit.includes('top_k')}
            onValue={(topK) => onChange({ topK })}
            onOmit={() => toggleOmit('top_k')}
          />
          <SamplingField
            label={t({ en: 'Max tokens', fr: 'Tokens max' })}
            param="max_tokens"
            value={settings?.maxTokens}
            fallback={settings?.defaultMaxTokens}
            omitted={omit.includes('max_tokens')}
            onValue={(maxTokens) => onChange({ maxTokens })}
            onOmit={() => toggleOmit('max_tokens')}
          />
          <Compaction
            value={settings?.compactionThreshold}
            maxTokens={contextWindow}
            onChange={(compactionThreshold) => onChange({ compactionThreshold })}
          />
        </div>
      </details>
      <PluginZone id="provider.modal.model_config" context={{ modelId: model.id }} />
    </div>
  )
}
