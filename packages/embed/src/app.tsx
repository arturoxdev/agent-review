/**
 * Orquestación de las siete pantallas del §7. Todo el estado vive aquí; los
 * componentes de `ui/` son presentacionales.
 */

import type { JSX } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import type { BoxModel, CreateEntryRequest, CreateEntryResponse } from '@punto/contracts'

import type { CloseSessionResponse, ErrorCode } from './api'
import {
  closeSession,
  createEntry,
  createSession,
  isApiFailure,
  patchEntry,
  putBlob,
  resolveUrl,
} from './api'
import { capture } from './capture'
import type { EmbedConfig } from './config'
import {
  inspectorLabel,
  isOwnNode,
  measureBoxModel,
  uniqueSelector,
  viewportRect,
  visibleText,
} from './measure'
import type { ViewportRect } from './measure'
import { resolveComponent } from './resolve-component'
import type { BubbleCorner, ScreenState, SessionState, StoredAnnotation } from './storage'
import {
  loadCorner,
  loadScreen,
  loadSession,
  resetScreen,
  saveCorner,
  saveScreen,
  saveSession,
} from './storage'
import { cx, hostPrefersDark, prefersReducedMotion, uuid } from './util'
import { BUBBLE_MARGIN, BUBBLE_SIZE, Bubble } from './ui/bubble'
import { BoxModelOverlay, SignalOutline } from './ui/box-model-overlay'
import { CommentPopover } from './ui/comment-popover'
import { FinishDialog, defaultTitle } from './ui/finish-dialog'
import { InspectorHint, InspectorLabel, InspectorLayer } from './ui/inspector'
import { AnnotationMarker } from './ui/marker'
import { Panel } from './ui/panel'
import type { SendPhase } from './ui/panel'
import { Toast } from './ui/toast'

const CANDIDATES =
  'a,button,input,select,textarea,label,summary,h1,h2,h3,h4,h5,h6,p,li,td,th,img,svg,figure,section,article,header,footer,nav,form,[role],[data-component]'

interface Hovered {
  el: Element
  rect: ViewportRect
  box: BoxModel
  label: string
}

interface Pending {
  el: Element
  rect: ViewportRect
  label: string
  /** id de la anotación que se está editando, o null si es nueva. */
  editingId: string | null
  body: string
}

function describe(el: Element): Hovered {
  const rect = viewportRect(el)
  const resolved = resolveComponent(el)
  return { el, rect, box: measureBoxModel(el), label: inspectorLabel(el, resolved.component, rect) }
}

function elementAt(x: number, y: number): Element | null {
  const stack = document.elementsFromPoint(x, y)
  for (const el of stack) {
    if (!isOwnNode(el) && el !== document.documentElement) return el
  }
  return null
}

function annotatable(): Element[] {
  const out: Element[] = []
  for (const el of Array.from(document.querySelectorAll(CANDIDATES))) {
    if (isOwnNode(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) continue
    out.push(el)
  }
  return out
}

function anchoredStyle(corner: BubbleCorner, gap: number): JSX.CSSProperties {
  const right = corner === 'br' || corner === 'tr'
  const bottom = corner === 'br' || corner === 'bl'
  const offset = `${BUBBLE_MARGIN + BUBBLE_SIZE + gap}px`
  return {
    [right ? 'right' : 'left']: `${BUBBLE_MARGIN}px`,
    [bottom ? 'bottom' : 'top']: offset,
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export interface AppProps {
  config: EmbedConfig
  /** El `<div id="punto-root">`, para ocultarlo al serializar. */
  root: HTMLElement
}

export function App({ config, root }: AppProps): JSX.Element {
  const [screen, setScreen] = useState<ScreenState>(loadScreen)
  const [session, setSession] = useState<SessionState | null>(loadSession)
  const [corner, setCorner] = useState<BubbleCorner>(loadCorner)

  const [inspecting, setInspecting] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const [phase, setPhase] = useState<SendPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<ErrorCode | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [link, setLink] = useState<string | null>(null)
  const [autoCopied, setAutoCopied] = useState(false)
  const [closing, setClosing] = useState(false)
  const [finishError, setFinishError] = useState<ErrorCode | null>(null)

  const [dark, setDark] = useState(false)
  /** `tick` no se pinta: fuerza el recálculo de los recuadros en scroll/resize. */
  const [tick, bump] = useState(0)

  const elements = useRef(new Map<string, Element>())
  const tabIndexRef = useRef(-1)
  const bubbleRef = useRef<HTMLButtonElement | null>(null)
  const reducedMotion = useMemo(prefersReducedMotion, [])

  const persistScreen = useCallback((next: ScreenState) => {
    setScreen(next)
    saveScreen(next)
  }, [])

  const persistSession = useCallback((next: SessionState | null) => {
    setSession(next)
    saveSession(next)
  }, [])

  // ---- Tema: se sigue al anfitrión si usa `.dark`, si no al sistema. ----
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const sync = (): void => setDark(hostPrefersDark())
    sync()
    media.addEventListener('change', sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      media.removeEventListener('change', sync)
      observer.disconnect()
    }
  }, [])

  // ---- Rehidratación: se reatan las anotaciones guardadas a sus elementos. ----
  useEffect(() => {
    const attach = (): void => {
      for (const annotation of screen.annotations) {
        if (elements.current.has(annotation.id)) continue
        try {
          const el = document.querySelector(annotation.target.selector)
          if (el && !isOwnNode(el)) elements.current.set(annotation.id, el)
        } catch {
          /* selector inservible: la anotación sigue en la lista, sin recuadro. */
        }
      }
      bump((n) => n + 1)
    }
    attach()
    const timer = setTimeout(attach, 600)
    return () => clearTimeout(timer)
    // Solo al montar y cuando cambia la lista de anotaciones.
  }, [screen.annotations])

  // ---- Los recuadros siguen al scroll y al resize. ----
  useEffect(() => {
    const onChange = (): void => bump((n) => n + 1)
    window.addEventListener('scroll', onChange, true)
    window.addEventListener('resize', onChange)
    return () => {
      window.removeEventListener('scroll', onChange, true)
      window.removeEventListener('resize', onChange)
    }
  }, [])

  const exitInspect = useCallback(() => {
    setInspecting(false)
    setHovered(null)
    setPending(null)
    tabIndexRef.current = -1
  }, [])

  const enterInspect = useCallback(() => {
    setPanelOpen(false)
    setInspecting(true)
  }, [])

  // ---- §7·A2 — atajos de teclado. ----
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // ⌥⇧C — entra y sale del modo inspección.
      if (event.altKey && event.shiftKey && event.code === 'KeyC') {
        event.preventDefault()
        if (inspecting) exitInspect()
        else enterInspect()
        return
      }

      if (!inspecting || pending !== null) return

      if (event.key === 'Escape') {
        event.preventDefault()
        exitInspect()
        return
      }

      if (event.key === 'Tab') {
        // Tab / Shift+Tab recorren elementos anotables sin mouse (§7·A2, §11).
        const list = annotatable()
        if (list.length === 0) return
        event.preventDefault()
        const step = event.shiftKey ? -1 : 1
        const next = (tabIndexRef.current + step + list.length) % list.length
        tabIndexRef.current = next
        const el = list[next]
        if (!el) return
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        setHovered(describe(el))
        return
      }

      if (event.key === 'Enter' && hovered) {
        event.preventDefault()
        setPending({
          el: hovered.el,
          rect: hovered.rect,
          label: hovered.label,
          editingId: null,
          body: '',
        })
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [inspecting, pending, hovered, enterInspect, exitInspect])

  // ---- §7·A5·3 — el toast se autodescarta a los 3 s. ----
  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  const onMove = useCallback(
    (x: number, y: number) => {
      if (pending !== null) return
      const el = elementAt(x, y)
      if (!el) return
      setHovered((current) => (current && current.el === el ? current : describe(el)))
    },
    [pending],
  )

  const onPick = useCallback(
    (x: number, y: number) => {
      const el = elementAt(x, y)
      if (!el) return
      const info = describe(el)
      setHovered(info)
      setPending({ el, rect: info.rect, label: info.label, editingId: null, body: '' })
    },
    [],
  )

  const addAnnotation = useCallback(
    (body: string) => {
      if (!pending) return
      const el = pending.el

      if (pending.editingId !== null) {
        const id = pending.editingId
        persistScreen({
          ...screen,
          annotations: screen.annotations.map((a) => (a.id === id ? { ...a, body } : a)),
        })
        setPending(null)
        return
      }

      const resolved = resolveComponent(el)
      const id = uuid()
      const annotation: StoredAnnotation = {
        id,
        number: screen.annotations.length + 1,
        body,
        createdAt: new Date().toISOString(),
        target: {
          selector: uniqueSelector(el),
          tag: el.tagName.toLowerCase(),
          text: visibleText(el),
          resolvedBy: resolved.resolvedBy,
          ...(resolved.component !== undefined ? { component: resolved.component } : {}),
          ...(resolved.componentStack !== undefined
            ? { componentStack: resolved.componentStack }
            : {}),
          ...(resolved.source !== undefined ? { source: resolved.source } : {}),
        },
      }
      elements.current.set(id, el)
      persistScreen({ ...screen, annotations: [...screen.annotations, annotation] })
      setPending(null)
      // Se vuelve al modo inspección para el siguiente comentario (§7·A3).
      setInspecting(true)
    },
    [pending, screen, persistScreen],
  )

  const deleteAnnotation = useCallback(
    (id: string) => {
      elements.current.delete(id)
      const next = screen.annotations
        .filter((a) => a.id !== id)
        .map((a, index) => ({ ...a, number: index + 1 }))
      persistScreen({ ...screen, annotations: next })
    },
    [screen, persistScreen],
  )

  const editAnnotation = useCallback(
    (id: string) => {
      const annotation = screen.annotations.find((a) => a.id === id)
      const el = elements.current.get(id)
      if (!annotation || !el || !el.isConnected) return
      const info = describe(el)
      setPanelOpen(false)
      setPending({
        el,
        rect: info.rect,
        label: info.label,
        editingId: id,
        body: annotation.body,
      })
    },
    [screen.annotations],
  )

  // ---------------------------------------------------------------- envío --
  const send = useCallback(
    async (forceNewSession = false) => {
      if (phase !== 'idle') return
      setError(null)
      setPhase('capturing')
      setProgress(0)

      let captured: Awaited<ReturnType<typeof capture>>
      try {
        captured = await capture({
          root,
          annotations: screen.annotations,
          elements: elements.current,
        })
      } catch {
        setPhase('idle')
        setError('capture')
        return
      }

      // §4.1·5 — ni sin CSS externo cupo: no se llama al API.
      if (captured.tooHeavy) {
        setPhase('idle')
        setError('too-heavy')
        return
      }

      setPhase('uploading')

      const body: CreateEntryRequest = {
        url: location.href,
        pageTitle: document.title,
        viewport: captured.viewport,
        annotations: captured.annotations,
      }

      const active = forceNewSession ? null : session
      let created: CreateEntryResponse
      try {
        created =
          active === null
            ? await createSession(config, screen.idempotencyKey, {
                ...body,
                title: defaultTitle(),
              })
            : await createEntry(config, active.publicId, screen.idempotencyKey, body)
      } catch (failure) {
        setPhase('idle')
        setError(isApiFailure(failure) ? failure.code : 'csp')
        return
      }

      let snapshotOk = true
      try {
        await putBlob(
          resolveUrl(config, created.snapshotUploadUrl),
          captured.body,
          'application/json',
          captured.gzipped ? 'gzip' : null,
          setProgress,
        )
      } catch (failure) {
        snapshotOk = false
        setError(isApiFailure(failure) ? failure.code : 'csp')
      }

      // El thumb es best-effort: si falla, `ready` igual y `thumbnailUrl: null`.
      // Si el snapshot falló no se sube: la entry no debe quedarse con una URL de
      // thumbnail que apunta a un blob que nunca existió.
      let thumbFailed = captured.thumbnail === null || !snapshotOk
      if (snapshotOk && captured.thumbnail) {
        try {
          await putBlob(
            resolveUrl(config, created.thumbnailUploadUrl),
            captured.thumbnail.blob,
            captured.thumbnail.contentType,
            null,
            () => undefined,
          )
        } catch {
          // El índice del documento cae a path + badge.
          thumbFailed = true
        }
      }

      try {
        await patchEntry(
          config,
          created.publicId,
          created.entry.id,
          screen.idempotencyKey,
          snapshotOk ? 'ready' : 'failed',
          thumbFailed,
        )
      } catch {
        /* el PATCH es de estado: si falla, la entry queda `pending` en el server. */
      }

      setPhase('idle')
      setProgress(0)

      if (!snapshotOk) return

      const nextSession: SessionState = {
        publicId: created.publicId,
        entryCount: (active?.entryCount ?? 0) + 1,
        annotationCount: (active?.annotationCount ?? 0) + screen.annotations.length,
      }
      persistSession(nextSession)
      persistScreen(resetScreen())
      elements.current.clear()

      setToast(`Pantalla ${nextSession.entryCount} agregada a la sesión`)

      if (captured.degradedNoExternalCss) {
        // §7·A7 — aviso, no fallo: el panel se queda abierto con la banda.
        setError('heavy')
        setPanelOpen(true)
      } else {
        setPanelOpen(false)
      }
    },
    [phase, root, screen, session, config, persistScreen, persistSession],
  )

  const onErrorAction = useCallback(
    (code: ErrorCode) => {
      setError(null)
      if (code === 'closed') {
        // §4.1 — se ofrece un nuevo POST /api/sessions.
        persistSession(null)
        void send(true)
        return
      }
      if (code === 'offline' || code === 'capture' || code === 'too-heavy') void send()
    },
    [send, persistSession],
  )

  // ------------------------------------------------------------ finalizar --
  const finish = useCallback(
    async (title: string) => {
      if (!session) return
      setClosing(true)
      setFinishError(null)
      let closed: CloseSessionResponse = {}
      try {
        closed = await closeSession(config, session.publicId, uuid(), title)
      } catch (failure) {
        setClosing(false)
        // Una sesión ya cerrada es un éxito idempotente desde el embed.
        if (!isApiFailure(failure) || failure.code !== 'closed') {
          setFinishError(isApiFailure(failure) ? failure.code : 'csp')
          return
        }
      }
      setClosing(false)
      // El API devuelve el link del documento; se construye solo como respaldo.
      const url = closed.url ?? `${config.apiBase}/s/${session.publicId}`
      setLink(url)
      setAutoCopied(await copyText(url))
    },
    [session, config],
  )

  const closeFinish = useCallback(() => {
    setFinishOpen(false)
    if (link !== null) {
      // La sesión quedó cerrada: la siguiente pantalla estrena documento.
      persistSession(null)
      setLink(null)
      setAutoCopied(false)
    }
  }, [link, persistSession])

  // ----------------------------------------------------------------- render
  const overlays = useMemo(() => {
    return screen.annotations.map((annotation) => {
      const el = elements.current.get(annotation.id)
      if (!el || !el.isConnected) return null
      const rect = viewportRect(el)
      if (rect.width === 0 && rect.height === 0) return null
      return { annotation, rect }
    })
    // `tick` fuerza el recálculo en scroll/resize.
  }, [screen.annotations, highlightId, tick])

  const anchored = anchoredStyle(corner, 8)

  return (
    <div class={cx(dark && 'dark', 'punto-layer')}>
      {inspecting ? (
        <InspectorLayer frozen={pending !== null} onMove={onMove} onPick={onPick} />
      ) : null}

      {/* Recuadros persistentes + marcadores numerados de lo ya anotado. */}
      <div class="punto-layer">
        {overlays.map((item) =>
          item === null ? null : (
            <div key={item.annotation.id}>
              <SignalOutline
                rect={item.rect}
                dimmed={highlightId !== null && highlightId !== item.annotation.id}
              />
              <div
                style={{
                  position: 'absolute',
                  top: `${item.rect.top - 12}px`,
                  left: `${item.rect.left - 12}px`,
                }}
              >
                <AnnotationMarker
                  number={item.annotation.number}
                  active={highlightId === item.annotation.id}
                  label={`Comentario ${item.annotation.number}: ${item.annotation.body.slice(0, 60)}`}
                />
              </div>
            </div>
          ),
        )}

        {inspecting && hovered && pending === null ? (
          <BoxModelOverlay rect={hovered.rect} box={hovered.box} />
        ) : null}
      </div>

      {inspecting && hovered && pending === null ? (
        <InspectorLabel rect={hovered.rect} text={hovered.label} />
      ) : null}
      {inspecting && pending === null ? <InspectorHint /> : null}

      {pending ? (
        <CommentPopover
          number={
            pending.editingId === null
              ? screen.annotations.length + 1
              : (screen.annotations.find((a) => a.id === pending.editingId)?.number ?? 1)
          }
          label={pending.label}
          rect={pending.rect}
          initialBody={pending.body}
          editing={pending.editingId !== null}
          onCancel={() => setPending(null)}
          onSubmit={addAnnotation}
        />
      ) : null}

      <Bubble
        corner={corner}
        entryCount={session?.entryCount ?? 0}
        hasSession={session !== null}
        active={inspecting || panelOpen}
        buttonRef={(el) => {
          bubbleRef.current = el
        }}
        onActivate={() => {
          if (panelOpen) setPanelOpen(false)
          else enterInspect()
        }}
        onPanel={() => {
          exitInspect()
          setPanelOpen((open) => !open)
        }}
        onCornerChange={(next) => {
          setCorner(next)
          saveCorner(next)
        }}
      />

      {panelOpen ? (
        <Panel
          annotations={screen.annotations}
          entryCount={session?.entryCount ?? 0}
          hasSession={session !== null}
          phase={phase}
          progress={progress}
          error={error}
          reducedMotion={reducedMotion}
          style={anchored}
          onHover={setHighlightId}
          onEdit={editAnnotation}
          onDelete={deleteAnnotation}
          onSend={() => void send()}
          onFinish={() => {
            setPanelOpen(false)
            setFinishOpen(true)
          }}
          onErrorAction={onErrorAction}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}

      {toast !== null && !panelOpen ? <Toast message={toast} style={anchored} /> : null}

      {finishOpen && session ? (
        <FinishDialog
          entryCount={session.entryCount}
          annotationCount={session.annotationCount}
          link={link}
          busy={closing}
          error={finishError}
          autoCopied={autoCopied}
          returnFocusTo={bubbleRef.current}
          onConfirm={(title) => void finish(title)}
          onCopy={(value) => {
            void copyText(value).then((ok) => setAutoCopied(ok))
          }}
          onClose={closeFinish}
        />
      ) : null}
    </div>
  )
}
