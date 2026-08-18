import Link from 'next/link'
import { APP_NAME } from '@punto/contracts'
import { LogOutIcon, UserRoundIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { requireAccount } from '@/lib/dal'
import { logoutAction } from './actions'

/** La bolita del producto, en chico. Nunca en magenta: la señal es solo anotación (§5). */
function Dot() {
  return (
    <span
      aria-hidden
      className="flex size-4 items-center justify-center rounded-full border border-border bg-primary"
    >
      <span className="size-1.5 rounded-full bg-primary-foreground" />
    </span>
  )
}

/** Cromo del panel (PRD §9): una barra y nada más. */
export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const account = await requireAccount()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-3 px-6">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Dot />
            <span className="text-sm">{APP_NAME}</span>
          </Link>
          <span className="text-sm text-muted-foreground">Panel</span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/account">
                <UserRoundIcon data-icon="inline-start" />
                <span className="hidden sm:inline">{account.email}</span>
                <span className="sm:hidden">Cuenta</span>
              </Link>
            </Button>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="icon-sm" aria-label="Cerrar sesión">
                <LogOutIcon />
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
