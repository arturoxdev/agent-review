'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  changePasswordAction,
  type ChangePasswordState,
} from '../actions'

const INITIAL_STATE: ChangePasswordState = {}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? 'Guardando…' : 'Cambiar contraseña'}
    </Button>
  )
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, INITIAL_STATE)

  return (
    <form action={action} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(state.errors?.currentPassword)}>
          <FieldLabel htmlFor="current-password">Contraseña actual</FieldLabel>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.errors?.currentPassword)}
          />
          <FieldError errors={state.errors?.currentPassword?.map((message) => ({ message }))} />
        </Field>
        <Field data-invalid={Boolean(state.errors?.newPassword)}>
          <FieldLabel htmlFor="new-password">Contraseña nueva</FieldLabel>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-invalid={Boolean(state.errors?.newPassword)}
          />
          <FieldError errors={state.errors?.newPassword?.map((message) => ({ message }))} />
        </Field>
        {state.message ? (
          state.success ? (
            <p role="status" className="text-sm text-muted-foreground">{state.message}</p>
          ) : (
            <FieldError>{state.message}</FieldError>
          )
        ) : null}
        <SaveButton />
      </FieldGroup>
    </form>
  )
}
