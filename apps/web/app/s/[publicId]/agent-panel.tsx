'use client'

import { DownloadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { buildAgentMarkdown, type Session } from '@punto/contracts'

import { CopyButton } from '@/components/punto/copy-button'
import { Button } from '@/components/ui/button'

export function agentPrompt(jsonUrl: string): string {
  return [
    'Revisa esta sesión de review de UI y arregla lo señalado:',
    jsonUrl,
    '',
    'Cada anotación trae selector, componente y ruta cuando se pudo resolver.',
  ].join('\n')
}

export type AgentPanelProps = {
  session: Session
  jsonUrl: string
}

/** Pestaña «Para el agente» (PRD §8). */
export function AgentPanel({ session, jsonUrl }: AgentPanelProps) {
  const prompt = agentPrompt(jsonUrl)

  const download = (): void => {
    const markdown = buildAgentMarkdown(session, jsonUrl)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${session.publicId}.md`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    toast.success('Markdown descargado')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[62ch] text-sm text-muted-foreground">
        El mismo recurso que ves aquí responde JSON. Pégale este prompt a tu agente
        y tendrá selector, componente y ruta de cada anotación.
      </p>

      <pre className="overflow-x-auto rounded-lg border bg-card p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {prompt}
      </pre>

      <div className="flex flex-wrap gap-2">
        <CopyButton
          value={prompt}
          label="Copiar prompt"
          variant="default"
          toastMessage="Prompt copiado"
        />
        <CopyButton
          value={jsonUrl}
          label="Copiar URL del JSON"
          variant="outline"
          toastMessage="URL del JSON copiada"
        />
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <DownloadIcon aria-hidden />
          Descargar .md
        </Button>
      </div>
    </div>
  )
}
