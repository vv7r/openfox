import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, Eye, X } from 'lucide-react'
import { groupModeFamilies, splitModeSuffix } from '@shared/reasoning-effort.js'
import { authFetch, getJson, sendJson } from '../../api'
import { reloadProviders, showSettings } from '../../controller'
import { t } from '../../i18n'
import { copyToClipboard } from '../../lib/clipboard'
import { PluginZone } from '../../plugins/Slots'
import styles from '../Panels.module.css'
import { ModelSettingsPanel, type ProbeState, type TestMode, type TestResult } from './ModelSettingsPanel'
import {
  applyAutoConfig,
  buildMerged,
  defaultEffort,
  expandMerged,
  filterModels,
  findDuplicate,
  mergeCatalog,
  modelPayload,
  settingsFromCatalog,
  settingsFromModel,
  type AutoConfigResult,
  type ModelInfo,
  type ModelSettings,
  type Settings,
} from './wizard'

export interface EditableProvider {
  id: string
  name: string
  url: string
  backend: string
  apiKey?: string
  isLocal?: boolean
  thinkingField?: string
  sendReasoningInMessages?: boolean
  authAdapter?: string
  transportAdapter?: string
  logo?: string
  models?: ModelInfo[]
}

interface Preset {
  id: string
  name: string
  authAdapter?: string
  transportAdapter?: string
  defaults: { name?: string; url: string; backend: string }
}

interface Challenge {
  mode?: 'device' | 'browser' | 'external'
  verificationUrl: string
  directUrl?: string
  userCode?: string
  instructions: string
}

type AuthState = 'disconnected' | 'pending' | 'connected' | 'error'

const LOCAL_ENGINES = [
  { port: 8000, backend: 'vllm', name: 'vLLM' },
  { port: 11434, backend: 'ollama', name: 'Ollama' },
  { port: 8080, backend: 'llamacpp', name: 'llama.cpp' },
  { port: 1234, backend: 'lmstudio', name: 'LM Studio' },
  { port: 8888, backend: 'unsloth', name: 'Unsloth' },
]
const AUTH_POLL_MS = 1500
const MANUAL_CONTEXT_WINDOW = 200_000

async function errorOf(response: Response, fallback: string): Promise<string> {
  return ((await response.json().catch(() => ({}))) as { error?: string }).error ?? fallback
}

export default function ProviderWizard({ edit, onClose }: { edit: EditableProvider | null; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(edit ? 2 : 1)
  const [name, setName] = useState(edit?.name ?? '')
  const [url, setUrl] = useState(edit?.url ?? '')
  const [backend, setBackend] = useState(edit?.backend ?? 'unknown')
  const [apiKey, setApiKey] = useState(edit?.apiKey ?? '')
  const [isLocal, setIsLocal] = useState(edit?.isLocal ?? false)
  const [authAdapter, setAuthAdapter] = useState(edit?.authAdapter)
  const [transportAdapter, setTransportAdapter] = useState(edit?.transportAdapter)
  const [logo, setLogo] = useState(edit?.logo ?? '')
  const [thinkingField, setThinkingField] = useState(edit?.thinkingField ?? '')
  const [sendReasoning, setSendReasoning] = useState(edit?.sendReasoningInMessages ?? true)
  const [presets, setPresets] = useState<Preset[]>([])

  const initial = useMemo(() => {
    const models = edit?.models ?? []
    const explicit = models.filter((model) => model.selected).map((model) => model.id)
    return {
      models,
      settings: Object.fromEntries(models.map((model) => [model.id, settingsFromModel(model)])) as Settings,
      // Older configs have no selection flag: everything they list was in use
      selected: new Set(explicit.length > 0 ? explicit : models.map((model) => model.id)),
    }
  }, [edit])
  const [models, setModels] = useState<ModelInfo[]>(initial.models)
  const [settings, setSettings] = useState<Settings>(initial.settings)
  const [selected, setSelected] = useState<Set<string>>(initial.selected)
  const [expanded, setExpanded] = useState<string | null>(initial.models[0]?.id ?? null)

  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [manualId, setManualId] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [probes, setProbes] = useState<Record<string, ProbeState>>({})
  const [tests, setTests] = useState<Record<string, TestResult>>({})
  const [raw, setRaw] = useState<string | null>(null)
  const [showDefaults, setShowDefaults] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [authState, setAuthState] = useState<AuthState>('disconnected')
  const [authBusy, setAuthBusy] = useState(false)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [pageOpened, setPageOpened] = useState(false)
  const [copied, setCopied] = useState(false)
  const saved = useRef(false)
  const draftTried = useRef(false)
  const probing = Object.values(probes).includes('probing')

  useEffect(() => {
    void getJson<{ presets: Preset[] }>('/api/provider-presets')
      .then((data) => setPresets(data.presets))
      .catch(() => {})
  }, [])

  const patchSettings = (id: string, patch: Partial<ModelSettings>) =>
    setSettings((all) => ({ ...all, [id]: { ...all[id]!, ...patch } }))

  const resetModels = () => {
    setModels([])
    setSettings({})
    setSelected(new Set())
    setProbes({})
    setTests({})
    setSearch('')
    setManualId('')
    setManualError(null)
  }

  const ensureDraft = async (): Promise<string> => {
    if (edit?.id) return edit.id
    if (draftId) return draftId
    const response = await sendJson('/api/providers', 'POST', {
      name: name || 'Provider',
      url,
      backend,
      authAdapter,
      transportAdapter,
      logo: logo.trim() || undefined,
      isLocal: false,
      models: [],
    })
    if (!response.ok) throw new Error('create failed')
    const data = (await response.json()) as { provider?: { id?: string } }
    if (!data.provider?.id) throw new Error('create failed')
    setDraftId(data.provider.id)
    return data.provider.id
  }

  const runAutoConfig = (id: string) => {
    setProbes((all) => ({ ...all, [id]: 'probing' }))
    void sendJson('/api/providers/auto-config', 'POST', {
      url,
      apiKey: apiKey || undefined,
      backend: backend || 'unknown',
      models: [{ id }],
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('probe failed')
        const data = (await response.json()) as { models: AutoConfigResult[] }
        for (const result of data.models) {
          setSettings((all) => ({
            ...all,
            [result.id]: { ...all[result.id]!, ...applyAutoConfig(result, all[result.id]) },
          }))
          if (result.sendReasoningInMessages === false) setSendReasoning(false)
          if (result.thinkingField) setThinkingField(result.thinkingField)
          setProbes((all) => ({ ...all, [result.id]: 'done' }))
        }
      })
      .catch(() => setProbes((all) => ({ ...all, [id]: 'error' })))
  }

  const selectModel = (model: ModelInfo) => {
    setSelected((all) => new Set(all).add(model.id))
    setSettings((all) => ({ ...all, [model.id]: { contextWindow: model.contextWindow, ...all[model.id] } }))
  }

  const fetchModels = async () => {
    setFetching(true)
    setFetchError(null)
    const firstLoad = !edit && models.length === 0 && selected.size === 0
    const fallback = t(
      { en: 'Failed to fetch models from {{url}}', fr: 'Échec de la récupération des modèles depuis {{url}}' },
      { url },
    )
    try {
      const params = new URLSearchParams({ url })
      if (apiKey) params.set('apiKey', apiKey)
      if (backend) params.set('backend', backend)
      const response = transportAdapter
        ? await authFetch(`/api/providers/${await ensureDraft()}/models`)
        : await authFetch(`/api/providers/models?${params.toString()}`)
      if (!response.ok) {
        setFetchError(await errorOf(response, fallback))
        return
      }
      const data = (await response.json()) as { models?: ModelInfo[] }
      if (!data.models?.length) return
      const { combined, added } = mergeCatalog(models, data.models, selected)
      setModels(combined)
      setExpanded((id) => (id && combined.some((model) => model.id === id) ? id : null))
      setSettings((all) => {
        const next = { ...all }
        for (const model of added) next[model.id] ??= settingsFromCatalog(model)
        return next
      })
      if (firstLoad && combined.length === 1) {
        setSelected(new Set([combined[0]!.id]))
        setExpanded(combined[0]!.id)
        runAutoConfig(combined[0]!.id)
      } else {
        setSelected((all) => new Set([...all].filter((id) => combined.some((model) => model.id === id))))
      }
    } catch (failure) {
      setFetchError(`${fallback}: ${failure instanceof Error ? failure.message : ''}`)
    } finally {
      setFetching(false)
    }
  }

  const refreshAuth = async (providerId: string): Promise<AuthState> => {
    const response = await authFetch(`/api/provider-auth/${providerId}/status`)
    if (!response.ok) {
      setAuthState('error')
      return 'error'
    }
    const { state } = (await response.json()) as { state: string }
    const next: AuthState = state === 'connected' || state === 'pending' || state === 'error' ? state : 'disconnected'
    setAuthState(next)
    return next
  }

  const onlyMerged = models.length > 0 && models.every((model) => model.modes?.length)
  useEffect(() => {
    if (step !== 2 || !url || fetching || fetchError) return
    if (models.length > 0 && !onlyMerged) return
    if (authAdapter && authState !== 'connected') return
    void fetchModels()
    // Reacts to entering the step and to the sign-in finishing, nothing else
  }, [step, authState])

  useEffect(() => {
    if (authAdapter && edit?.id) void refreshAuth(edit.id)
  }, [authAdapter, edit?.id])

  // Plugin auth screens attach accounts to the provider: it needs a real id before they render
  useEffect(() => {
    if (step !== 2 || edit?.id || draftId || !authAdapter || draftTried.current) return
    draftTried.current = true
    void ensureDraft().catch(() => {
      draftTried.current = false
    })
  }, [step, authAdapter, edit?.id, draftId])

  const providerId = edit?.id ?? draftId
  useEffect(() => {
    if (!challenge || !providerId) return
    let cancelled = false
    const check = async () => {
      const state = await refreshAuth(providerId)
      if (cancelled || state !== 'connected') return
      setChallenge(null)
      setPageOpened(false)
      setCopied(false)
    }
    void check()
    const timer = setInterval(() => void check(), AUTH_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [challenge, providerId])

  const connect = async () => {
    setAuthBusy(true)
    setAuthState('pending')
    try {
      const id = await ensureDraft()
      const response = await authFetch(`/api/provider-auth/${id}/login`, { method: 'POST' })
      if (!response.ok) throw new Error('login failed')
      setChallenge((await response.json()) as Challenge)
    } catch {
      setAuthState('error')
    } finally {
      setAuthBusy(false)
    }
  }

  const openChallenge = () => {
    if (!challenge) return
    window.open(challenge.directUrl ?? challenge.verificationUrl, '_blank', 'noopener,noreferrer')
    setPageOpened(true)
  }

  const copyCode = () => {
    if (!challenge?.userCode) return
    void copyToClipboard(challenge.userCode)
    setCopied(true)
  }

  const test = (id: string, mode: TestMode) => {
    const key = `${id}-${mode}`
    const config = settings[id]
    setTests((all) => ({ ...all, [key]: { loading: true } }))
    void sendJson('/api/providers/test-params', 'POST', {
      url,
      providerId: providerId ?? undefined,
      transportAdapter,
      model: id,
      apiKey: apiKey || undefined,
      backend: backend || 'unknown',
      thinkingField: thinkingField || undefined,
      mode,
      modelConfig: {
        temperature: config?.temperature,
        topP: config?.topP,
        topK: config?.topK,
        maxTokens: config?.maxTokens,
        supportsVision: config?.supportsVision,
        thinkingEnabled: config?.thinkingEnabled,
        thinkingLevel: config?.thinkingLevel,
        nonThinkingEnabled: config?.nonThinkingEnabled,
        thinkingQueryParams: config?.thinkingQueryParams,
        nonThinkingQueryParams: config?.nonThinkingQueryParams,
        omitParams: config?.omitParams,
      },
    })
      .then(async (response) => {
        const data = (await response.json()) as { error?: string }
        setTests((all) => ({
          ...all,
          [key]: response.ok
            ? { loading: false, result: JSON.stringify(data, null, 2) }
            : { loading: false, error: data.error ?? t({ en: 'Test failed', fr: 'Échec du test' }) },
        }))
      })
      .catch((failure: unknown) =>
        setTests((all) => ({
          ...all,
          [key]: {
            loading: false,
            error: failure instanceof Error ? failure.message : t({ en: 'Request failed', fr: 'Échec de la requête' }),
          },
        })),
      )
  }

  const addManual = () => {
    const id = manualId.trim()
    if (!id) {
      setManualError(t({ en: 'Enter a model name', fr: 'Saisissez un nom de modèle' }))
      return
    }
    const existing = findDuplicate(models, id)
    if (existing) {
      selectModel(existing)
      setManualError(
        t({ en: '"{{id}}" is already in the list', fr: '« {{id}} » figure déjà dans la liste' }, { id: existing.id }),
      )
      setManualId('')
      if (!authAdapter && probes[existing.id] !== 'probing') runAutoConfig(existing.id)
      return
    }
    setModels((all) => [...all, { id, contextWindow: MANUAL_CONTEXT_WINDOW } as ModelInfo])
    setSelected((all) => new Set(all).add(id))
    setSettings((all) => ({ ...all, [id]: { contextWindow: MANUAL_CONTEXT_WINDOW, thinkingEnabled: true } }))
    setExpanded(id)
    setManualId('')
    setManualError(null)
    setFetchError(null)
  }

  const mergeFamily = (baseId: string, members: ModelInfo[]) => {
    const merged = buildMerged(
      baseId,
      models.find((model) => model.id === baseId),
      members,
    )
    const removed = new Set(members.map((model) => model.id))
    setModels((all) => [merged, ...all.filter((model) => !removed.has(model.id) && model.id !== baseId)])
    setSettings((all) => {
      const next = { ...all }
      for (const id of removed) {
        if (next[id] && !next[baseId]) next[baseId] = next[id]
        delete next[id]
      }
      next[baseId] ??= settingsFromCatalog(merged)
      return next
    })
    if ([...removed].some((id) => selected.has(id))) {
      setSelected((all) => new Set([...all].filter((id) => !removed.has(id))).add(baseId))
    }
  }

  const unmergeFamily = (merged: ModelInfo) => {
    const members = expandMerged(merged)
    setModels((all) => [...members, ...all.filter((model) => model.id !== merged.id)])
    setSettings((all) => {
      const { [merged.id]: config, ...rest } = all
      const fallback = config ?? {
        contextWindow: merged.contextWindow,
        thinkingLevel: defaultEffort(merged.reasoningEfforts),
      }
      return { ...rest, ...Object.fromEntries(members.map((member) => [member.id, { ...fallback }])) }
    })
    if (selected.has(merged.id)) {
      setSelected((all) => {
        const next = new Set(all)
        next.delete(merged.id)
        members.forEach((member) => next.add(member.id))
        return next
      })
    }
  }

  const close = () => {
    if (draftId && !saved.current) void authFetch(`/api/providers/${draftId}`, { method: 'DELETE' }).catch(() => {})
    onClose()
  }

  const save = async () => {
    setSaveError(null)
    const body = {
      name: name || 'Provider',
      url,
      backend: backend || 'unknown',
      apiKey: apiKey || undefined,
      isLocal,
      thinkingField: thinkingField || undefined,
      sendReasoningInMessages: sendReasoning,
      authAdapter,
      transportAdapter,
      logo: logo.trim() || undefined,
      models: models.map((model) => modelPayload(model, settings[model.id], selected.has(model.id))),
    }
    const response = providerId
      ? await sendJson(`/api/providers/${providerId}`, 'PUT', body)
      : await sendJson('/api/providers', 'POST', body)
    if (!response.ok) {
      setSaveError(
        await errorOf(
          response,
          t({ en: 'Failed to save the provider', fr: 'Échec de l’enregistrement du fournisseur' }),
        ),
      )
      return
    }
    saved.current = true
    await reloadProviders()
    onClose()
  }

  const applyPreset = (preset: Preset) => {
    setName(preset.defaults.name ?? preset.name)
    setUrl(preset.defaults.url)
    setBackend(preset.defaults.backend)
    setIsLocal(false)
    setApiKey('')
    setAuthAdapter(preset.authAdapter)
    setTransportAdapter(preset.transportAdapter)
    setFetchError(null)
    resetModels()
  }

  const applyLocal = (engine: (typeof LOCAL_ENGINES)[number]) => {
    setName(engine.name)
    setUrl(`http://localhost:${engine.port}`)
    setBackend(engine.backend)
    setIsLocal(true)
    setAuthAdapter(undefined)
    setTransportAdapter(undefined)
    setFetchError(null)
    resetModels()
  }

  const applyOther = () => {
    setBackend('unknown')
    setIsLocal(false)
    setAuthAdapter(undefined)
    setTransportAdapter(undefined)
    setFetchError(null)
    resetModels()
  }

  const visible = filterModels(models, search)
  const selectedModels = models.filter((model) => selected.has(model.id))
  const mergedModels = models.filter((model) => model.modes?.length)
  const families = useMemo(() => groupModeFamilies(models.filter((model) => splitModeSuffix(model.id))), [models])
  const engineChosen = (value: boolean): true | undefined => (value ? true : undefined)

  const modelHeader = (model: ModelInfo) => (
    <span className={styles.grow}>
      <span className={styles.modelHeader}>
        <span>
          {model.id}
          <span
            className={styles.muted}
          >{` · ${t({ en: '{{n}} ctx', fr: '{{n}} ctx' }, { n: settings[model.id]?.contextWindow ?? model.contextWindow })}`}</span>
        </span>
        {(settings[model.id]?.supportsVision ?? model.supportsVision) && (
          <Eye size={14} aria-label={t({ en: 'Vision model', fr: 'Modèle vision' })} />
        )}
      </span>
    </span>
  )

  const stepOne = (
    <PluginZone id="provider.modal.step1" context={{}}>
      <div className={styles.form}>
        <span className={styles.eyebrow}>{t({ en: 'Inference engine', fr: 'Moteur d’inférence' })}</span>
        <div className={styles.row}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={engineChosen(Boolean(transportAdapter && transportAdapter === preset.transportAdapter))}
              onClick={() => applyPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
          <button type="button" aria-pressed={engineChosen(backend === 'unknown')} onClick={applyOther}>
            {t({ en: 'Other', fr: 'Autre' })}
          </button>
          {LOCAL_ENGINES.map((engine) => (
            <button
              key={engine.port}
              type="button"
              aria-pressed={engineChosen(backend === engine.backend)}
              onClick={() => applyLocal(engine)}
            >
              {engine.name}
            </button>
          ))}
        </div>
        <div className={styles.row}>
          <span className={styles.grow}>
            {t({
              en: 'Cannot find your AI provider? A plugin may add it.',
              fr: 'Votre fournisseur d’IA n’apparaît pas ? Un plugin peut l’ajouter.',
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              close()
              showSettings('plugins')
            }}
          >
            {t({ en: 'Plugins', fr: 'Plugins' })}
          </button>
        </div>
        <div className={styles.row}>
          <span className={styles.grow}>
            {t({
              en: 'Behind a proxy? Configure it in the advanced settings.',
              fr: 'Derrière un proxy ? Configurez-le dans les paramètres avancés.',
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              close()
              showSettings('advanced')
            }}
          >
            {t({ en: 'Configure proxy', fr: 'Configurer le proxy' })}
          </button>
        </div>
        <label className={styles.field}>
          {t({ en: 'Provider URL', fr: 'URL du fournisseur' })}
          <input
            className={styles.input}
            data-testid="provider-url"
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          {t({ en: 'Provider name', fr: 'Nom du fournisseur' })}
          <input
            className={styles.input}
            data-testid="provider-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t({ en: 'My LLM server', fr: 'Mon serveur LLM' })}
          />
        </label>
        <label className={styles.field}>
          {t({ en: 'Logo URL (optional)', fr: 'URL du logo (facultatif)' })}
          <input className={styles.input} value={logo} onChange={(event) => setLogo(event.target.value)} />
        </label>
        {!authAdapter && (
          <label className={styles.field}>
            {t({ en: 'API key (optional)', fr: 'Clé API (facultatif)' })}
            <input
              className={styles.input}
              type="password"
              autoComplete="off"
              data-testid="provider-api-key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={isLocal} onChange={(event) => setIsLocal(event.target.checked)} />
          {t({ en: 'This is a local provider', fr: 'Fournisseur local' })}
        </label>
      </div>
    </PluginZone>
  )

  const authBlock = authAdapter && (
    <div className={styles.form} data-testid="provider-auth">
      <div className={styles.row}>
        <span className={styles.grow}>
          {authState === 'connected'
            ? t({ en: 'Connected', fr: 'Connecté' })
            : t({
                en: 'Connect this provider before choosing models.',
                fr: 'Connectez ce fournisseur avant de choisir les modèles.',
              })}
        </span>
        {authState !== 'connected' && (
          <button type="button" className={styles.primary} disabled={authBusy} onClick={() => void connect()}>
            {authBusy
              ? t({ en: 'Connecting…', fr: 'Connexion…' })
              : authState === 'error'
                ? t({ en: 'Retry', fr: 'Réessayer' })
                : t({ en: 'Connect', fr: 'Connecter' })}
          </button>
        )}
      </div>
      {challenge && (
        <div className={styles.form}>
          <p className={styles.muted}>{challenge.instructions}</p>
          {challenge.userCode && <code data-testid="device-code">{challenge.userCode}</code>}
          <div className={styles.row}>
            {challenge.userCode && (
              <button type="button" onClick={copyCode}>
                {copied ? t({ en: 'Copied', fr: 'Copié' }) : t({ en: 'Copy code', fr: 'Copier le code' })}
              </button>
            )}
            <button type="button" onClick={openChallenge}>
              {pageOpened
                ? t({ en: 'Reopen authorization', fr: 'Rouvrir l’autorisation' })
                : t({ en: 'Open authorization', fr: 'Ouvrir l’autorisation' })}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const stepTwo = (
    <div className={styles.form}>
      <div className={styles.row}>
        <span className={`${styles.eyebrow} ${styles.grow}`}>
          {t({ en: 'Test and configure models', fr: 'Tester et configurer les modèles' })}
        </span>
        <button type="button" data-testid="provider-defaults" onClick={() => setShowDefaults(!showDefaults)}>
          {t({ en: 'Provider defaults', fr: 'Valeurs par défaut' })}
        </button>
      </div>
      {showDefaults && (
        <div className={styles.form}>
          <label className={styles.field}>
            {t({ en: 'Logo URL (optional)', fr: 'URL du logo (facultatif)' })}
            <input className={styles.input} value={logo} onChange={(event) => setLogo(event.target.value)} />
          </label>
          <label className={styles.field}>
            {t({ en: 'Thinking response field (override)', fr: 'Champ de réponse de réflexion (remplacement)' })}
            <input
              className={styles.input}
              value={thinkingField}
              onChange={(event) => setThinkingField(event.target.value)}
              placeholder={t({ en: 'Leave blank for auto-detect', fr: 'Laissez vide pour la détection automatique' })}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={sendReasoning}
              onChange={(event) => setSendReasoning(event.target.checked)}
            />
            {t({ en: 'Send reasoning in messages', fr: 'Envoyer le raisonnement dans les messages' })}
          </label>
        </div>
      )}
      {authBlock}
      {authAdapter && providerId && <PluginZone id="provider.modal.auth" context={{ providerId }} />}
      {fetching && <p className={styles.muted}>{t({ en: 'Fetching models…', fr: 'Récupération des modèles…' })}</p>}
      {fetchError && (
        <div className={styles.form}>
          <p className={styles.error}>{fetchError}</p>
          <div className={styles.row}>
            <button type="button" onClick={() => void fetchModels()}>
              {t({ en: 'Retry', fr: 'Réessayer' })}
            </button>
            {!edit && (
              <button
                type="button"
                onClick={() => {
                  setFetchError(null)
                  setStep(1)
                }}
              >
                {t({ en: 'Edit URL', fr: 'Modifier l’URL' })}
              </button>
            )}
          </div>
        </div>
      )}
      <label className={styles.field}>
        {t({ en: 'Add a model manually', fr: 'Ajouter un modèle manuellement' })}
        <span className={styles.row}>
          <input
            className={`${styles.input} ${styles.grow}`}
            data-testid="manual-model"
            value={manualId}
            onChange={(event) => setManualId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addManual()
              }
            }}
          />
          <button type="button" data-testid="manual-model-add" onClick={addManual}>
            {t({ en: 'Add', fr: 'Ajouter' })}
          </button>
        </span>
      </label>
      {manualError && <p className={styles.error}>{manualError}</p>}
      {selectedModels.length > 0 && (
        <section className={styles.form}>
          <span className={styles.eyebrow}>
            {t(
              { en: 'Selected models ({{count}})', fr: 'Modèles sélectionnés ({{count}})' },
              { count: selectedModels.length },
            )}
          </span>
          <p className={styles.muted}>
            {t({
              en: 'Only selected models appear in the model selector.',
              fr: 'Seuls les modèles sélectionnés apparaissent dans le sélecteur.',
            })}
          </p>
          <ul className={styles.list} data-testid="selected-models">
            {selectedModels.map((model) => (
              <li key={model.id} className={styles.column}>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.grow}
                    aria-expanded={expanded === model.id}
                    onClick={() => setExpanded(expanded === model.id ? null : model.id)}
                  >
                    {modelHeader(model)}
                  </button>
                  {probes[model.id] === 'done' && <span>{t({ en: 'Configured', fr: 'Configuré' })}</span>}
                  {probes[model.id] === 'error' && (
                    <span className={styles.error}>{t({ en: 'Failed', fr: 'Échec' })}</span>
                  )}
                  <button
                    type="button"
                    disabled={probes[model.id] === 'probing'}
                    onClick={() => runAutoConfig(model.id)}
                  >
                    {t({ en: 'Auto-config', fr: 'Auto-configuration' })}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((all) => {
                        const next = new Set(all)
                        next.delete(model.id)
                        return next
                      })
                    }
                  >
                    {t({ en: 'Remove', fr: 'Retirer' })}
                  </button>
                </div>
                {expanded === model.id && (
                  <ModelSettingsPanel
                    model={model}
                    settings={settings[model.id]}
                    probe={probes[model.id]}
                    tests={tests}
                    onChange={(patch) => patchSettings(model.id, patch)}
                    onAutoConfig={() => runAutoConfig(model.id)}
                    onTest={(mode) => test(model.id, mode)}
                    onShowRaw={setRaw}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {models.length > 0 && (
        <section className={styles.form}>
          <span className={styles.eyebrow}>{t({ en: 'Available models', fr: 'Modèles disponibles' })}</span>
          <input
            className={styles.input}
            data-testid="model-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t({ en: 'Search models…', fr: 'Rechercher des modèles…' })}
          />
          {mergedModels.map((model) => (
            <button key={model.id} type="button" onClick={() => unmergeFamily(model)}>
              {t(
                { en: 'Unmerge {{name}} ({{levels}})', fr: 'Dissocier {{name}} ({{levels}})' },
                { name: model.name ?? model.id, levels: model.modes!.map((mode) => mode.level).join(', ') },
              )}
            </button>
          ))}
          {families.map((family) => (
            <button
              key={family.baseId}
              type="button"
              onClick={() =>
                mergeFamily(
                  family.baseId,
                  models.filter((model) => family.members.some((member) => member.id === model.id)),
                )
              }
            >
              {t(
                { en: 'Merge {{name}}: {{levels}}', fr: 'Fusionner {{name}} : {{levels}}' },
                {
                  name: family.name,
                  levels: family.members.map((member) => splitModeSuffix(member.id)?.level ?? '').join(', '),
                },
              )}
            </button>
          ))}
          <div className={styles.row}>
            <span className={`${styles.muted} ${styles.grow}`}>
              {t(
                { en: 'Showing {{shown}} of {{total}} models', fr: '{{shown}} modèles sur {{total}}' },
                { shown: visible.length, total: models.length },
              )}
            </span>
            <button type="button" disabled={fetching} onClick={() => void fetchModels()}>
              {t({ en: 'Sync', fr: 'Synchroniser' })}
            </button>
            <button
              type="button"
              onClick={() => {
                visible.forEach(selectModel)
                visible.forEach((model) => {
                  if (!authAdapter && probes[model.id] !== 'probing' && probes[model.id] !== 'done')
                    runAutoConfig(model.id)
                })
              }}
            >
              {t({ en: 'Select all', fr: 'Tout sélectionner' })}
            </button>
            <button
              type="button"
              onClick={() =>
                setSelected((all) => new Set([...all].filter((id) => !visible.some((model) => model.id === id))))
              }
            >
              {t({ en: 'Deselect all', fr: 'Tout désélectionner' })}
            </button>
          </div>
          <ul className={styles.list} data-testid="available-models">
            {visible
              .filter((model) => !selected.has(model.id))
              .map((model) => (
                <li key={model.id}>
                  <button
                    type="button"
                    className={styles.grow}
                    onClick={() => {
                      selectModel(model)
                      if (!authAdapter && probes[model.id] !== 'done') runAutoConfig(model.id)
                    }}
                  >
                    {modelHeader(model)}
                  </button>
                </li>
              ))}
          </ul>
          {visible.length === 0 && (
            <p className={styles.muted}>
              {t(
                { en: 'No models match "{{query}}"', fr: 'Aucun modèle ne correspond à « {{query}} »' },
                { query: search },
              )}
            </p>
          )}
        </section>
      )}
      {saveError && <p className={styles.error}>{saveError}</p>}
    </div>
  )

  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} data-testid="provider-wizard" aria-describedby={undefined}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>
              {edit
                ? t({ en: 'Edit provider', fr: 'Modifier le fournisseur' })
                : t({ en: 'Add provider', fr: 'Ajouter un fournisseur' })}
            </Dialog.Title>
            <Dialog.Close className={styles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className={styles.body}>
            {step === 1 ? stepOne : stepTwo}
            <div className={styles.row}>
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => {
                    // A saved provider keeps its models: only a new one starts over
                    if (!edit) resetModels()
                    setStep(1)
                  }}
                >
                  <ArrowLeft size={12} />
                  {t({ en: 'Back', fr: 'Retour' })}
                </button>
              )}
              <span className={styles.grow} />
              <button type="button" onClick={close}>
                {t({ en: 'Cancel', fr: 'Annuler' })}
              </button>
              {step === 1 ? (
                <button
                  type="button"
                  className={styles.primary}
                  data-testid="provider-next"
                  disabled={!url}
                  onClick={() => setStep(2)}
                >
                  {t({ en: 'Next: test and configure', fr: 'Suivant : tester et configurer' })}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.primary}
                  data-testid="provider-save"
                  disabled={probing}
                  onClick={() => void save()}
                >
                  {probing
                    ? t({ en: 'Configuring…', fr: 'Configuration…' })
                    : t({ en: 'Save provider', fr: 'Enregistrer le fournisseur' })}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
      {raw !== null && (
        <Dialog.Root open onOpenChange={(open) => !open && setRaw(null)}>
          <Dialog.Portal>
            <Dialog.Overlay className={styles.overlay} />
            <Dialog.Content className={styles.dialog} aria-describedby={undefined}>
              <div className={styles.header}>
                <Dialog.Title className={styles.title}>{t({ en: 'Raw response', fr: 'Réponse brute' })}</Dialog.Title>
                <Dialog.Close className={styles.close} aria-label={t({ en: 'Close', fr: 'Fermer' })}>
                  <X size={16} />
                </Dialog.Close>
              </div>
              <div className={styles.body}>
                <pre className={styles.log}>{raw}</pre>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Dialog.Root>
  )
}
