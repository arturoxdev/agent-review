import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { FileQuestionIcon } from 'lucide-react'
import { APP_NAME } from '@punto/contracts'

import { EmptyState } from '@/components/punto/empty-state'
import { getSession, sessionDocumentUrl, sessionJsonUrl } from '@/lib/get-session'
import { SessionDocument } from './session-document'

/** Origen real de la petición: el documento es público y se sirve por link. */
async function requestOrigin(): Promise<string> {
  const headerList = await headers()
  const host = headerList.get('host') ?? 'localhost:3003'
  const forwarded = headerList.get('x-forwarded-proto')
  const protocol =
    forwarded ?? (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? 'http' : 'https')
  return `${protocol}://${host}`
}

export async function generateMetadata({
  params,
}: PageProps<'/s/[publicId]'>): Promise<Metadata> {
  const { publicId } = await params
  const session = await getSession(publicId)
  if (session === null) {
    return { title: `Documento no encontrado · ${APP_NAME}` }
  }
  return {
    title: `${session.title} · ${APP_NAME}`,
    description: `Review de UI de ${session.projectName}.`,
    robots: { index: false, follow: false },
  }
}

export default async function SessionPage({ params }: PageProps<'/s/[publicId]'>) {
  const { publicId } = await params
  const session = await getSession(publicId)

  if (session === null) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 py-24">
        <EmptyState
          className="w-full max-w-md"
          icon={<FileQuestionIcon />}
          title="Este documento no existe o el link caducó."
          description="Pide un link nuevo a quien hizo el review."
        />
      </main>
    )
  }

  const origin = await requestOrigin()

  return (
    <SessionDocument
      session={session}
      documentUrl={sessionDocumentUrl(origin, session.publicId)}
      jsonUrl={sessionJsonUrl(origin, session.publicId)}
    />
  )
}
