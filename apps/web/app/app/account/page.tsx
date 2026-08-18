import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { requireAccount } from '@/lib/dal'
import { PasswordForm } from './password-form'

export const metadata: Metadata = { title: 'Cuenta · Punto', robots: { index: false } }

export default async function AccountPage() {
  const account = await requireAccount()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href="/app">
          <ArrowLeftIcon data-icon="inline-start" />
          Proyectos
        </Link>
      </Button>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cuenta</h1>
        <p className="text-sm text-muted-foreground">{account.email}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>
            El cambio no cierra los Accesos ya emitidos; caducan por sí solos en siete días.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </main>
  )
}
