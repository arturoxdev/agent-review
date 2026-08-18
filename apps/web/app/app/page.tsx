import type { Metadata } from 'next'
import Link from 'next/link'
import { FolderPlusIcon } from 'lucide-react'
import { APP_NAME } from '@punto/contracts'

import { EmptyState } from '@/components/punto/empty-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getProjects, type ProjectCard } from '@/lib/get-projects'
import { formatDate, initial, plural } from './format'
import { NewProjectDialog } from './new-project-dialog'

export const metadata: Metadata = {
  title: `Proyectos · ${APP_NAME}`,
  robots: { index: false, follow: false },
}

function ProjectTile({ project }: { project: ProjectCard }) {
  return (
    <Link
      href={`/app/${project.id}`}
      className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full transition-colors duration-150 ease-out hover:bg-accent">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback className="font-mono">{initial(project.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
          </div>
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {plural(project.sessionCount, 'sesión', 'sesiones')}
            </span>
            <span className="tabular-nums">
              {project.lastSessionAt === null
                ? 'Sin sesiones todavía'
                : `Última: ${formatDate(project.lastSessionAt)}`}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function ProjectsPage() {
  const projects = await getProjects()

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Proyectos</h1>
        <NewProjectDialog />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderPlusIcon />}
          title="Aún no tienes proyectos."
          description="Crea uno para obtener tu snippet de instalación."
          action={
            <NewProjectDialog trigger={<Button variant="outline">Nuevo proyecto</Button>} />
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectTile key={project.id} project={project} />
          ))}
        </div>
      )}
    </main>
  )
}
