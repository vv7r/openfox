import { useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { sendJson } from '../api'
import { reloadProviders } from '../controller'
import { t } from '../i18n'
import panelStyles from '../panels/Panels.module.css'
import { ProvidersTab } from '../panels/SettingsLists'
import { navigate } from '../router'
import { useApp } from '../store/app'
import { DirectoryList, useDirectoryBrowser } from './DirectoryBrowser'
import styles from './Onboarding.module.css'

interface VisionFallback {
  enabled: boolean
  url?: string
  model?: string
  timeout: number
  backend?: 'ollama' | 'openai'
  providerModelRef?: string
  apiKey?: string
}

const VISION_DEFAULTS = {
  ollama: { url: 'http://localhost:11434', model: 'qwen3.5:0.8b' },
  openai: { url: 'http://localhost:8000/v1', model: 'qwen3.5-27b' },
} as const

const STEPS = [
  { en: 'LLM providers', fr: 'Fournisseurs LLM' },
  { en: 'Projects folder', fr: 'Dossier des projets' },
  { en: 'Vision', fr: 'Vision' },
]

function Steps({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return (
    <ol className={styles.steps}>
      {STEPS.map((label, index) => (
        <li key={label.en} data-state={index < step ? 'done' : index === step ? 'current' : undefined}>
          <button type="button" onClick={() => onStep(index)}>
            <span className={styles.stepDot}>{index < step ? <Check size={13} /> : index + 1}</span>
            <span className={styles.stepLabel}>{t(label)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function ProvidersStep({ onNext }: { onNext: () => void }) {
  const hasProviders = useApp((state) => state.providers.length > 0)
  return (
    <section className={panelStyles.body}>
      <h2 className={styles.title}>{t({ en: 'LLM providers', fr: 'Fournisseurs LLM' })}</h2>
      <p className={styles.lead}>
        {t({ en: 'Manage your LLM server connections', fr: 'Gérez vos connexions aux serveurs LLM' })}
      </p>
      <ProvidersTab />
      <button
        type="button"
        className={panelStyles.primary}
        disabled={!hasProviders}
        data-testid="onboarding-continue"
        onClick={onNext}
      >
        {t({ en: 'Continue', fr: 'Continuer' })}
      </button>
    </section>
  )
}

function FolderStep({
  workdir,
  onChange,
  onNext,
}: {
  workdir: string
  onChange: (path: string) => void
  onNext: () => void
}) {
  const { directory, browse } = useDirectoryBrowser(onChange)
  return (
    <section className={panelStyles.body}>
      <h2 className={styles.title}>{t({ en: 'Your projects folder', fr: 'Votre dossier de projets' })}</h2>
      <p className={styles.lead}>
        {t({
          en: 'Where should OpenFox create project folders?',
          fr: 'Où OpenFox doit-il créer les dossiers de projets ?',
        })}
      </p>
      <div className={panelStyles.row}>
        <input
          className={panelStyles.input}
          data-testid="onboarding-workdir"
          value={workdir}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" data-testid="onboarding-browse" onClick={() => browse(workdir)}>
          {t({ en: 'Browse', fr: 'Parcourir' })}
        </button>
      </div>
      <DirectoryList directory={directory} browse={browse} />
      <button
        type="button"
        className={panelStyles.primary}
        disabled={!workdir}
        data-testid="onboarding-workdir-next"
        onClick={onNext}
      >
        {t({ en: 'Continue', fr: 'Continuer' })}
      </button>
    </section>
  )
}

function VisionStep({ saving, onFinish }: { saving: boolean; onFinish: (vision: VisionFallback | undefined) => void }) {
  const providers = useApp((state) => state.providers)
  const options = useMemo(
    () =>
      providers.flatMap((provider) =>
        provider.models
          .filter((model) => model.supportsVision)
          .map((model) => ({ ref: `${provider.id}/${model.id}`, label: `${provider.name} · ${model.id}` })),
      ),
    [providers],
  )
  const [enabled, setEnabled] = useState(false)
  const [selected, setSelected] = useState('')
  const [backend, setBackend] = useState<'ollama' | 'openai'>('ollama')
  const [url, setUrl] = useState<string>(VISION_DEFAULTS.ollama.url)
  const [model, setModel] = useState<string>(VISION_DEFAULTS.ollama.model)
  const [apiKey, setApiKey] = useState('')

  const finish = () =>
    onFinish(
      enabled && selected
        ? { enabled, providerModelRef: selected, timeout: 120 }
        : {
            enabled,
            url,
            model,
            timeout: 120,
            backend,
            providerModelRef: '',
            apiKey: backend === 'openai' ? apiKey : '',
          },
    )

  return (
    <section className={panelStyles.body}>
      <h2 className={styles.title}>{t({ en: 'Vision (optional)', fr: 'Vision (facultatif)' })}</h2>
      <p className={styles.lead}>
        {t({
          en: 'Configure a vision model for non-vision models',
          fr: 'Configurez un modèle de vision pour les modèles sans vision',
        })}
      </p>
      <label className={panelStyles.toggle}>
        <input
          type="checkbox"
          data-testid="onboarding-vision"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {t({
          en: 'Enable vision fallback for non-vision models',
          fr: 'Activer la vision de secours pour les modèles sans vision',
        })}
      </label>
      {enabled && (
        <>
          {options.length > 0 ? (
            <label className={panelStyles.field}>
              {t({ en: 'Vision model from your providers', fr: 'Modèle de vision depuis vos fournisseurs' })}
              <select
                className={panelStyles.input}
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">{t({ en: 'Manual configuration…', fr: 'Configuration manuelle…' })}</option>
                {options.map((option) => (
                  <option key={option.ref} value={option.ref}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className={panelStyles.muted}>
              {t({
                en: 'No vision-capable models found in your providers. You can enter one manually below.',
                fr: 'Aucun modèle de vision trouvé dans vos fournisseurs. Vous pouvez en saisir un ci-dessous.',
              })}
            </p>
          )}
          {!selected && (
            <>
              <label className={panelStyles.field}>
                {t({ en: 'Backend type', fr: 'Type de backend' })}
                <select
                  className={panelStyles.input}
                  value={backend}
                  onChange={(event) => {
                    const next = event.target.value as 'ollama' | 'openai'
                    setBackend(next)
                    setUrl(VISION_DEFAULTS[next].url)
                    setModel(VISION_DEFAULTS[next].model)
                  }}
                >
                  <option value="ollama">{t({ en: 'Ollama', fr: 'Ollama' })}</option>
                  <option value="openai">
                    {t({ en: 'OpenAI-compatible (vLLM, llama.cpp)', fr: 'Compatible OpenAI (vLLM, llama.cpp)' })}
                  </option>
                </select>
              </label>
              <label className={panelStyles.field}>
                {t({ en: 'Vision server URL', fr: 'URL du serveur de vision' })}
                <input className={panelStyles.input} value={url} onChange={(event) => setUrl(event.target.value)} />
              </label>
              <label className={panelStyles.field}>
                {t({ en: 'Vision model name', fr: 'Nom du modèle de vision' })}
                <input className={panelStyles.input} value={model} onChange={(event) => setModel(event.target.value)} />
              </label>
              {backend === 'openai' && (
                <label className={panelStyles.field}>
                  {t({ en: 'API key (optional)', fr: 'Clé API (facultatif)' })}
                  <input
                    className={panelStyles.input}
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
              )}
            </>
          )}
        </>
      )}
      <div className={panelStyles.row}>
        <button type="button" disabled={saving} data-testid="onboarding-skip" onClick={() => onFinish(undefined)}>
          {t({ en: 'Skip for now', fr: 'Passer pour l’instant' })}
        </button>
        <span className={panelStyles.grow} />
        <button
          type="button"
          className={panelStyles.primary}
          disabled={saving}
          data-testid="onboarding-finish"
          onClick={finish}
        >
          {t({ en: 'Finish setup', fr: 'Terminer la configuration' })}
        </button>
      </div>
    </section>
  )
}

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [workdir, setWorkdir] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const leave = () => {
    void reloadProviders()
    navigate('/')
  }

  const finish = async (visionFallback: VisionFallback | undefined) => {
    setSaving(true)
    setError(null)
    const response = await sendJson('/api/init/config', 'POST', {
      workdir,
      ...(visionFallback ? { visionFallback } : {}),
    }).catch(() => null)
    setSaving(false)
    if (response?.ok) leave()
    else setError(t({ en: 'Could not save your settings', fr: 'Impossible d’enregistrer vos paramètres' }))
  }

  return (
    <main className={styles.page} data-testid="onboarding">
      <div className={styles.column}>
        <button type="button" className={styles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })} onClick={leave}>
          <X size={18} />
        </button>
        <Steps step={step} onStep={setStep} />
        {error && <p className={panelStyles.error}>{error}</p>}
        {step === 0 && <ProvidersStep onNext={() => setStep(1)} />}
        {step === 1 && <FolderStep workdir={workdir} onChange={setWorkdir} onNext={() => setStep(2)} />}
        {step === 2 && <VisionStep saving={saving} onFinish={(vision) => void finish(vision)} />}
      </div>
    </main>
  )
}
