import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRightIcon } from 'lucide-react'
import { APP_NAME } from '@punto/contracts'

import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: `${APP_NAME} — reviews de UI`,
  description: 'Anota elementos reales de una pantalla y compártelos en un documento.',
}

/** La bolita del producto, en chico. El magenta de señal es solo anotación (§5). */
function Dot() {
  return (
    <span
      aria-hidden
      className="flex size-5 items-center justify-center rounded-full border border-border bg-primary"
    >
      <span className="size-2 rounded-full bg-primary-foreground" />
    </span>
  )
}

const links: { href: '/app' | '/s/demo' | '/dev/host'; title: string; description: string }[] = [
  {
    href: '/app',
    title: 'Panel',
    description: 'Proyectos, snippet de instalación y sesiones pasadas.',
  },
  {
    href: '/s/demo',
    title: 'Documento de ejemplo',
    description: 'Cómo se lee un review terminado: pantallas, recuadros y comentarios.',
  },
  {
    href: '/dev/host',
    title: 'Página de pruebas',
    description: 'Host dummy para probar la bolita sin salir del repo.',
  },
]

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-6 py-24">
      <div className="flex flex-col gap-4">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Dot />
          {APP_NAME}
        </span>
        <h1 className="max-w-[24ch] text-3xl font-semibold tracking-tight text-balance">
          Reviews de UI sobre la pantalla real, no sobre una captura.
        </h1>
        <p className="max-w-[62ch] text-base leading-relaxed text-muted-foreground">
          Un <code className="font-mono text-sm">&lt;script&gt;</code> en tu sitio deja una
          bolita flotante. Señala elementos, escribe qué está mal y comparte un link con todo
          el review: para quien lo lee y para el agente que lo arregla.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link href="/app">Abrir el panel</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/s/demo">Ver un documento</Link>
          </Button>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
        {links.map((link) => (
          <li key={link.href} className="bg-card">
            <Link
              href={link.href}
              className="flex h-full flex-col gap-1 p-4 outline-none transition-colors duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex items-center gap-1 text-sm font-medium">
                {link.title}
                <ArrowUpRightIcon aria-hidden className="size-3.5 text-muted-foreground" />
              </span>
              <span className="text-sm text-muted-foreground">{link.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
