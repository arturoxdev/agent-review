'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { createProjectAction, type CreateProjectState } from './actions'

export type NewProjectDialogProps = { trigger?: React.ReactNode }

const INITIAL_STATE: CreateProjectState = {}

export function NewProjectDialog({ trigger }: NewProjectDialogProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [state, formAction, pending] = useActionState(createProjectAction, INITIAL_STATE)

  React.useEffect(() => {
    if (!state.projectId) return
    toast.success('Proyecto creado')
    router.push(`/app/${state.projectId}`)
  }, [router, state.projectId])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next) }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nuevo proyecto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form action={formAction} noValidate>
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
            <DialogDescription>Cada proyecto tiene su propia clave pública de instalación.</DialogDescription>
          </DialogHeader>

          <FieldGroup className="my-6">
            <Field data-invalid={Boolean(state.message)} data-disabled={pending}>
              <FieldLabel htmlFor="project-name">Nombre del proyecto</FieldLabel>
              <Input
                id="project-name"
                name="name"
                autoComplete="off"
                maxLength={120}
                disabled={pending}
                aria-invalid={Boolean(state.message)}
              />
              <FieldError>{state.message}</FieldError>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {pending ? 'Creando…' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
