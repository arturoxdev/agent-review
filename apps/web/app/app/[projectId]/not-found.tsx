import Link from 'next/link'
import { FolderXIcon } from 'lucide-react'

import { EmptyState } from '@/components/punto/empty-state'
import { Button } from '@/components/ui/button'

export default function ProjectNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 py-24">
      <EmptyState
        className="w-full max-w-md"
        icon={<FolderXIcon />}
        title="Este proyecto no existe."
        description="Puede que se haya borrado o que el link esté mal."
        action={
          <Button asChild variant="outline">
            <Link href="/app">Ver proyectos</Link>
          </Button>
        }
      />
    </main>
  )
}
