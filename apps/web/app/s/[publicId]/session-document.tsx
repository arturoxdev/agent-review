'use client'

import * as React from 'react'
import { EllipsisIcon, ImageOffIcon, InfoIcon, PrinterIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  annotationCount,
  APP_NAME,
  type Annotation,
  type Entry,
  type Session,
} from '@punto/contracts'

import { CopyButton } from '@/components/punto/copy-button'
import { EmptyState } from '@/components/punto/empty-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { AgentPanel } from './agent-panel'
import styles from './document.module.css'
import { formatDate, plural } from './format'
import { IndexStrip } from './index-strip'
import { ScreenBlock, screenAnchorId } from './screen-block'

export type SessionDocumentProps = {
  session: Session
  /** URL pública del documento (para `Copiar link`). */
  documentUrl: string
  /** URL del JSON que consume el agente. */
  jsonUrl: string
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

/** Marca de producto: la bolita. */
function Dot() {
  return (
    <span
      aria-hidden
      className="flex size-4 items-center justify-center rounded-full border border-border bg-primary"
    >
      <span className="size-1.5 rounded-full bg-primary-foreground" />
    </span>
  )
}

export function SessionDocument({
  session,
  documentUrl,
  jsonUrl,
}: SessionDocumentProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const commentRefs = React.useRef(new Map<string, HTMLElement>())

  const annotations: Annotation[] = React.useMemo(
    () => session.entries.flatMap((entry) => entry.annotations),
    [session],
  )

  const registerCommentRef = React.useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element === null) commentRefs.current.delete(id)
      else commentRefs.current.set(id, element)
    },
    [],
  )

  const focusComment = React.useCallback((id: string) => {
    const element = commentRefs.current.get(id)
    if (element === undefined) return
    element.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
    element.focus({ preventScroll: true })
  }, [])

  const activate = React.useCallback(
    (id: string | null, origin: 'comment' | 'marker' | 'key') => {
      setActiveId(id)
      if (id !== null && origin !== 'comment') focusComment(id)
    },
    [focusComment],
  )

  // Teclado del documento (PRD §11): Esc desactiva, j/k saltan de comentario.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setActiveId(null)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      if (event.key !== 'j' && event.key !== 'k') return
      if (annotations.length === 0) return

      event.preventDefault()
      setActiveId((current) => {
        const index = annotations.findIndex((item) => item.id === current)
        const step = event.key === 'j' ? 1 : -1
        const nextIndex =
          index === -1
            ? event.key === 'j'
              ? 0
              : annotations.length - 1
            : (index + step + annotations.length) % annotations.length
        const next = annotations[nextIndex]
        if (next === undefined) return current
        focusComment(next.id)
        return next.id
      })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [annotations, focusComment])

  const jumpToEntry = React.useCallback((entry: Entry) => {
    const element = document.getElementById(screenAnchorId(entry))
    element?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    })
  }, [])

  const copy = React.useCallback((value: string, message: string) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(value)
        toast.success(message)
      } catch {
        toast.error('No se pudo copiar')
      }
    })()
  }, [])

  const total = annotationCount(session)
  const meta = [
    `Proyecto ${session.projectName}`,
    formatDate(session.createdAt),
    plural(session.entries.length, 'pantalla', 'pantallas'),
    plural(total, 'comentario', 'comentarios'),
  ].join(' · ')

  return (
    <div className={cn('flex min-h-full flex-col', styles.document)}>
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b bg-background/80 backdrop-blur print:hidden">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-3 px-6">
          <span className="flex items-center gap-2 font-medium">
            <Dot />
            <span className="text-sm">{APP_NAME}</span>
          </span>
          <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground md:block">
            {session.title}
          </span>
          <span className="flex-1 md:hidden" />
          <CopyButton
            value={documentUrl}
            label="Copiar link"
            variant="outline"
            className="hidden md:inline-flex"
            toastMessage="Link copiado"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Más acciones">
                <EllipsisIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  copy(documentUrl, 'Link copiado')
                }}
              >
                Copiar link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  copy(jsonUrl, 'URL del JSON copiada')
                }}
              >
                Copiar URL del JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  window.print()
                }}
              >
                <PrinterIcon aria-hidden />
                Imprimir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        <div className="flex flex-wrap items-center gap-3 pt-8">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            {session.title}
          </h1>
          {session.status === 'open' ? (
            <Badge variant="outline">En curso</Badge>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{meta}</p>

        {session.status === 'open' ? (
          <Alert className="mt-4">
            <InfoIcon aria-hidden />
            <AlertTitle>Esta sesión sigue abierta.</AlertTitle>
            <AlertDescription>Pueden agregarse más pantallas.</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue="documento" className="mt-6">
          <TabsList className="print:hidden">
            <TabsTrigger value="documento">Documento</TabsTrigger>
            <TabsTrigger value="agente">Para el agente</TabsTrigger>
          </TabsList>

          <TabsContent value="documento" className="mt-2">
            {session.entries.length === 0 ? (
              <EmptyState
                className="mt-6"
                icon={<ImageOffIcon />}
                title="Todavía no se ha enviado ninguna pantalla."
                description="Cuando el revisor mande la primera, aparecerá aquí."
              />
            ) : (
              <>
                <IndexStrip entries={session.entries} onJump={jumpToEntry} />
                <div className="mt-8 flex flex-col gap-12">
                  {session.entries.map((entry) => (
                    <ScreenBlock
                      key={entry.id}
                      entry={entry}
                      activeId={activeId}
                      hoveredId={hoveredId}
                      onActivate={activate}
                      onHover={setHoveredId}
                      registerCommentRef={registerCommentRef}
                    />
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="agente" className="mt-6">
            <AgentPanel session={session} jsonUrl={jsonUrl} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
