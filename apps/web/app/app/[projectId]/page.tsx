import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon, ArrowUpRightIcon, InboxIcon } from 'lucide-react'
import { APP_NAME, buildInstallMarkdown, type SessionSummary } from '@punto/contracts'

import { AgentCopyButton, CopyButton } from '@/components/punto/copy-button'
import { EmptyState } from '@/components/punto/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  documentUrl,
  embedSnippet,
  getProjectDetail,
  panelOrigin,
} from '@/lib/get-projects'
import { formatDate, plural } from '../format'

export async function generateMetadata({
  params,
}: PageProps<'/app/[projectId]'>): Promise<Metadata> {
  const { projectId } = await params
  const detail = await getProjectDetail(projectId)
  return {
    title:
      detail === null
        ? `Proyecto no encontrado · ${APP_NAME}`
        : `${detail.project.name} · ${APP_NAME}`,
    robots: { index: false, follow: false },
  }
}

function StatusBadge({ status }: { status: SessionSummary['status'] }) {
  return status === 'open' ? (
    <Badge variant="outline">En curso</Badge>
  ) : (
    <Badge variant="secondary">Cerrada</Badge>
  )
}

function SessionRow({ session, origin }: { session: SessionSummary; origin: string }) {
  const url = documentUrl(session.publicId, origin)
  return (
    <TableRow>
      <TableCell className="max-w-[22ch] truncate pl-4 font-medium sm:max-w-[38ch]">
        {session.title}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {session.entryCount}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {session.annotationCount}
      </TableCell>
      <TableCell>
        <StatusBadge status={session.status} />
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {formatDate(session.createdAt)}
      </TableCell>
      <TableCell className="pr-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="sm">
            <a href={url} target="_blank" rel="noreferrer">
              Abrir <ArrowUpRightIcon aria-hidden />
            </a>
          </Button>
          <CopyButton value={url} label="Copiar link" toastMessage="Link copiado" />
        </div>
      </TableCell>
    </TableRow>
  )
}

export default async function ProjectDetailPage({ params }: PageProps<'/app/[projectId]'>) {
  const { projectId } = await params
  const detail = await getProjectDetail(projectId)
  if (detail === null) notFound()

  const { project, sessions } = detail
  const origin = panelOrigin()
  const snippet = embedSnippet(project.publicKey, origin)
  const installMarkdown = buildInstallMarkdown(project, origin)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit text-muted-foreground"
        >
          <Link href="/app">
            <ArrowLeftIcon aria-hidden />
            Proyectos
          </Link>
        </Button>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm tabular-nums text-muted-foreground">
            {plural(project.sessionCount, 'sesión', 'sesiones')} · creado el{' '}
            {formatDate(project.createdAt)}
          </p>
        </div>
      </div>

      {/* ── Instalación (§C2) ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Instalación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-muted px-3 py-2.5 font-mono text-xs leading-relaxed">
              <code>{snippet}</code>
            </pre>
            <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
              <CopyButton
                value={snippet}
                label="Copiar snippet"
                variant="outline"
                size="lg"
                toastMessage="Snippet copiado"
              />
              <AgentCopyButton
                value={installMarkdown}
                label="Para el agente"
                variant="outline"
                size="lg"
                toastMessage="Instructivo de instalación copiado"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Pégalo antes de <code className="font-mono">&lt;/body&gt;</code>. En desarrollo
            detecta nombres de componente React automáticamente.
          </p>

          <Separator />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm text-muted-foreground">Clave pública</span>
            <code className="font-mono text-sm break-all">{project.publicKey}</code>
            <CopyButton value={project.publicKey} toastMessage="Clave copiada" />
          </div>
        </CardContent>
      </Card>

      {/* ── Sesiones (§C2) ────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium tracking-tight">Sesiones</h2>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<InboxIcon />}
            title="Todavía no hay sesiones en este proyecto."
            description="Instala el snippet y envía tu primera pantalla desde la bolita."
          />
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Título</TableHead>
                  <TableHead className="text-right">Pantallas</TableHead>
                  <TableHead className="text-right">Comentarios</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="pr-4 text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <SessionRow key={session.publicId} session={session} origin={origin} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  )
}
