/**
 * §4.1 · "Cómo se prueba en local" — página dummy para probar la bolita sin
 * levantar otro repo. Carga `/embed.js` con la `data-key` de
 * `NEXT_PUBLIC_PUNTO_DEV_KEY` (o un placeholder de seed).
 *
 * No usa `data-api`: el embed cae al origen del propio script, que aquí es el
 * mismo Punto. Un host externo sí lo necesita (ver `packages/embed/README.md`).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Host de pruebas · Punto',
  description: 'Página dummy para probar el embed en local.',
}

const DEV_KEY = process.env.NEXT_PUBLIC_PUNTO_DEV_KEY ?? 'pk_dev_armot_local'

const INSUMOS = [
  { code: 'INS-0001', name: 'Cemento gris 50 kg', unit: 'saco', stock: 128, price: '$212.00' },
  { code: 'INS-0002', name: 'Varilla 3/8" 12 m', unit: 'pieza', stock: 42, price: '$189.50' },
  { code: 'INS-0003', name: 'Arena de río', unit: 'm³', stock: 9, price: '$540.00' },
  { code: 'INS-0004', name: 'Block hueco 15×20×40', unit: 'pieza', stock: 1_240, price: '$18.90' },
]

export default function DevHostPage() {
  // Página de pruebas: en producción no existe. `VERCEL_ENV` solo vale 'production'
  // en el deploy de producción, así que las previews la conservan igual que el local.
  if (process.env.VERCEL_ENV === 'production') notFound()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-full bg-primary" />
            <span className="text-sm font-semibold tracking-tight">Host de pruebas</span>
          </div>
          <nav aria-label="Principal" className="flex items-center gap-4 text-sm">
            <a className="text-muted-foreground hover:text-foreground" href="#formulario">
              Formulario
            </a>
            <a className="text-muted-foreground hover:text-foreground" href="#tabla">
              Tabla
            </a>
            <a className="text-muted-foreground hover:text-foreground" href="#tarjetas">
              Tarjetas
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Nuevo insumo</h1>
        <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
          Página dummy con formularios, botones, tabla y layout variado. Abre la bolita de{' '}
          <span className="font-mono">Punto</span> abajo a la derecha, o entra al modo inspección
          con <kbd className="rounded border px-1 font-mono text-xs">⌥⇧C</kbd>.
        </p>

        {/* ---------------------------------------------------- formulario -- */}
        <section id="formulario" className="mt-8 rounded-lg border bg-card p-6">
          <h2 className="text-lg font-medium">Datos del insumo</h2>
          <form className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="nombre">
                Nombre
              </label>
              <input
                id="nombre"
                name="nombre"
                placeholder="Cemento gris 50 kg"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="clave">
                Clave
              </label>
              <input
                id="clave"
                name="clave"
                defaultValue="INS-0005"
                className="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="unidad">
                Unidad
              </label>
              <select
                id="unidad"
                name="unidad"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option>saco</option>
                <option>pieza</option>
                <option>m³</option>
                <option>kg</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="precio">
                Precio unitario
              </label>
              <input
                id="precio"
                name="precio"
                type="number"
                defaultValue={212}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm tabular-nums"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="notas">
                Notas
              </label>
              <textarea
                id="notas"
                name="notas"
                rows={3}
                placeholder="Observaciones de compra…"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-2 sm:col-span-2">
              <input id="activo" name="activo" type="checkbox" defaultChecked />
              <label className="text-sm" htmlFor="activo">
                Insumo activo
              </label>
            </div>

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Guardar cambios
              </button>
              <button
                type="button"
                className="h-9 rounded-md border bg-card px-4 text-sm font-medium"
              >
                Guardar y crear otro
              </button>
              <button type="button" className="h-9 rounded-md px-4 text-sm font-medium">
                Cancelar
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-white"
              >
                Eliminar
              </button>
            </div>
          </form>
        </section>

        {/* --------------------------------------------------------- tabla -- */}
        <section id="tabla" className="mt-8">
          <h2 className="text-lg font-medium">Insumos existentes</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Clave</th>
                  <th className="px-4 py-2 font-medium">Nombre</th>
                  <th className="px-4 py-2 font-medium">Unidad</th>
                  <th className="px-4 py-2 text-right font-medium">Stock</th>
                  <th className="px-4 py-2 text-right font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {INSUMOS.map((row) => (
                  <tr key={row.code} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">{row.code}</td>
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{row.stock}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{row.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------ tarjetas -- */}
        <section id="tarjetas" className="mt-8">
          <h2 className="text-lg font-medium">Resumen</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'Órdenes abiertas', value: '12', hint: '3 vencen esta semana' },
              { title: 'Valor de inventario', value: '$482,910', hint: 'Actualizado hoy' },
              { title: 'Proveedores', value: '27', hint: '2 sin contrato vigente' },
            ].map((card) => (
              <article key={card.title} className="rounded-lg border bg-card p-4">
                <h3 className="text-sm text-muted-foreground">{card.title}</h3>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-lg border bg-card p-6">
          <h2 className="text-lg font-medium">Bloque largo</h2>
          <p className="mt-2 max-w-[62ch] text-base leading-relaxed">
            Este párrafo existe para que la página tenga scroll y se pueda comprobar que los
            recuadros de las anotaciones siguen a su elemento al desplazar, y que la bolita se
            imanta a la esquina más cercana cuando se suelta. En 390 px de ancho la bolita no
            debería tapar contenido crítico.
          </p>
          <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
            <li>Elementos anotables variados: enlaces, botones, celdas, encabezados.</li>
            <li>Sin React Fiber en producción minificada, el embed cae a heurística.</li>
            <li>
              El snapshot se serializa con <span className="font-mono">rrweb-snapshot</span>.
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          Host de pruebas de Punto · <span className="font-mono">{DEV_KEY}</span>
        </div>
      </footer>

      {/* El snippet del §4.1, tal cual lo pegaría un sitio anfitrión. */}
      <script src="/embed.js" data-key={DEV_KEY} defer />
    </div>
  )
}
