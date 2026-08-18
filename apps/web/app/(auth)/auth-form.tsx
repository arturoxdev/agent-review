'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'

import { login, signup, type AuthFormState } from '@/app/auth-actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

const INITIAL_STATE: AuthFormState = {}

function SubmitButton({ mode }: { mode: 'login' | 'signup' }) {
  const { pending } = useFormStatus()
  const idle = mode === 'login' ? 'Entrar' : 'Crear cuenta'
  const busy = mode === 'login' ? 'Entrando…' : 'Creando…'

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? busy : idle}
    </Button>
  )
}

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const action = mode === 'login' ? login : signup
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const isLogin = mode === 'login'

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{isLogin ? 'Entrar a Punto' : 'Crear una cuenta'}</CardTitle>
        <CardDescription>
          {isLogin
            ? 'Usa el correo y la contraseña de tu cuenta.'
            : 'Tu cuenta será dueña de todos los proyectos que crees.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(state.errors?.email)}>
              <FieldLabel htmlFor={`${mode}-email`}>Correo</FieldLabel>
              <Input
                id={`${mode}-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-invalid={Boolean(state.errors?.email)}
              />
              <FieldError errors={state.errors?.email?.map((message) => ({ message }))} />
            </Field>
            <Field data-invalid={Boolean(state.errors?.password)}>
              <FieldLabel htmlFor={`${mode}-password`}>Contraseña</FieldLabel>
              <Input
                id={`${mode}-password`}
                name="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={8}
                required
                aria-invalid={Boolean(state.errors?.password)}
              />
              <FieldError errors={state.errors?.password?.map((message) => ({ message }))} />
            </Field>
            {state.message ? <FieldError>{state.message}</FieldError> : null}
            <SubmitButton mode={mode} />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <Link className="font-medium text-foreground underline underline-offset-4" href={isLogin ? '/signup' : '/login'}>
            {isLogin ? 'Regístrate' : 'Entra'}
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
