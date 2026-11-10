import type { Attachment } from '@shared/types.js'
import { launchWorkflow, loadCommand, sendCommand } from '../actions'
import { t } from '../i18n'
import type { NamedItem } from '../store/app'
import { fillTemplate, parametersToAsk, templateParams, withTypedText, type ParamRequest } from './launch'

export type AskParams = (request: ParamRequest) => void

export interface CommandContext {
  workdir: string | undefined
  typedText: string
  attachments: Attachment[]
  clearComposer: () => void
  askParams: AskParams
}

export function runWorkflowItem(workflow: NamedItem, askParams: AskParams, subGroup?: string): void {
  const options = { ...(workflow.scope ? { scope: workflow.scope } : {}), ...(subGroup ? { subGroup } : {}) }
  const parameters = parametersToAsk(workflow.parameters)
  if (parameters.length === 0) {
    launchWorkflow(workflow.id, undefined, options)
    return
  }
  askParams({
    name: workflow.name,
    confirmLabel: t({ en: 'Run workflow', fr: 'Exécuter le workflow' }),
    parameters,
    onConfirm: (values) => launchWorkflow(workflow.id, values, options),
  })
}

export async function runCommandItem(command: NamedItem, context: CommandContext): Promise<void> {
  if (!context.workdir) return
  const { prompt, agentMode } = await loadCommand(command.id, context.workdir)
  const send = (text: string) => {
    void sendCommand(withTypedText(context.typedText, text), agentMode, context.attachments)
    context.clearComposer()
  }
  const keys = templateParams(prompt)
  if (keys.length === 0) {
    send(prompt)
    return
  }
  context.askParams({
    name: command.name,
    confirmLabel: t({ en: 'Launch command', fr: 'Lancer la commande' }),
    parameters: keys.map((key, position) => ({ id: key, label: key, position })),
    onConfirm: (values) => send(fillTemplate(prompt, values)),
  })
}
