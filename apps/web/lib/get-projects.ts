import 'server-only'

import { cache } from 'react'
import type { Project, SessionSummary } from '@punto/contracts'

import { requireAccount } from './dal'
import { getProjectById, listProjects, listSessionSummaries } from './db/queries'
import { getEnv } from './env'

/** Un proyecto de la reja de `/app`, incluida su última actividad. */
export type ProjectCard = Project & {
  lastSessionAt: string | null
}

export type ProjectDetailView = {
  project: Project
  sessions: SessionSummary[]
}

function byDateDesc(sessions: readonly SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getProjects(): Promise<ProjectCard[]> {
  const account = await requireAccount()
  const ownedProjects = await listProjects(account.id)

  return Promise.all(
    ownedProjects.map(async (project): Promise<ProjectCard> => {
      if (project.sessionCount === 0) return { ...project, lastSessionAt: null }
      const projectSessions = await listSessionSummaries(project.id)
      return { ...project, lastSessionAt: byDateDesc(projectSessions)[0]?.createdAt ?? null }
    }),
  )
}

/**
 * El `ownerId` forma parte de la consulta. Un id ajeno y uno inexistente son el
 * mismo `null`, por lo que la página responde 404 sin filtrar existencia.
 */
export const getProjectDetail = cache(async function getProjectDetail(
  projectId: string,
): Promise<ProjectDetailView | null> {
  const account = await requireAccount()
  const project = await getProjectById(projectId, account.id)
  if (project === null) return null

  return {
    project,
    sessions: byDateDesc(await listSessionSummaries(project.id)),
  }
})

export function panelOrigin(): string {
  return getEnv().PUNTO_ORIGIN
}

export function embedSnippet(publicKey: string, origin: string = panelOrigin()): string {
  return `<script src="${origin}/embed.js" data-key="${publicKey}" data-api="${origin}" defer></script>`
}

export function documentUrl(publicId: string, origin: string = panelOrigin()): string {
  return `${origin}/s/${publicId}`
}
