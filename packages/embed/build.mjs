// Build del bundle standalone del embed (PRD §3).
//
//   1. Tailwind v4 compila `src/styles.css` a un string.
//   2. esbuild empaqueta Preact + el string de CSS en un IIFE minificado.
//   3. Se emite a `apps/web/public/embed.js` (y una copia en `dist/`).
//   4. Se reporta raw + gzip y se FALLA si el bundle sin `rrweb-snapshot`
//      supera el presupuesto duro de 60 KB gzip.
//
// No hay dependencias fuera de las ya declaradas: esbuild, @tailwindcss/cli, zlib.

import { execFileSync } from 'node:child_process'
import { gzipSync, constants as zlibConstants } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const DIST = join(HERE, 'dist')
const PUBLIC_OUT = join(REPO, 'apps', 'web', 'public', 'embed.js')

/** Presupuesto duro del §3: < 60 KB gzip sin contar rrweb-snapshot. */
const BUDGET_GZIP = 60 * 1024

const watch = process.argv.includes('--watch')

function gzipSize(code) {
  return gzipSync(Buffer.from(code, 'utf8'), { level: zlibConstants.Z_BEST_COMPRESSION }).length
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** Tailwind v4 → un string de CSS que se inyecta dentro del Shadow Root. */
function buildCss() {
  const bin = join(HERE, 'node_modules', '.bin', 'tailwindcss')
  const out = join(DIST, 'styles.css')
  mkdirSync(DIST, { recursive: true })
  execFileSync(bin, ['-i', join(HERE, 'src', 'styles.css'), '-o', out, '--minify'], {
    cwd: HERE,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return readFileSync(out, 'utf8').trim()
}

/**
 * Sustituye `rrweb-snapshot` por un stub para poder medir el presupuesto del §3,
 * que se define explícitamente "sin contar rrweb-snapshot".
 */
const stubRrweb = {
  name: 'stub-rrweb',
  setup(build) {
    build.onResolve({ filter: /^rrweb-snapshot$/ }, () => ({
      path: 'rrweb-snapshot',
      namespace: 'stub',
    }))
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export function snapshot(){return null}export function createMirror(){return{getId(){return -1}}}',
      loader: 'js',
    }))
  },
}

function baseOptions(css) {
  return {
    entryPoints: [join(HERE, 'src', 'index.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    define: {
      __PUNTO_CSS__: JSON.stringify(css),
      'process.env.NODE_ENV': '"production"',
    },
    // El embed no usa React, pero alguna dependencia podría pedirlo.
    alias: { react: 'preact/compat', 'react-dom': 'preact/compat' },
    write: false,
  }
}

async function run() {
  const css = buildCss()

  const full = await esbuild.build(baseOptions(css))
  const code = full.outputFiles[0].text

  const lean = await esbuild.build({ ...baseOptions(css), plugins: [stubRrweb] })
  const leanCode = lean.outputFiles[0].text

  mkdirSync(DIST, { recursive: true })
  writeFileSync(join(DIST, 'embed.js'), code)
  writeFileSync(PUBLIC_OUT, code)

  const rawFull = Buffer.byteLength(code, 'utf8')
  const gzFull = gzipSize(code)
  const gzLean = gzipSize(leanCode)
  const gzCss = gzipSize(css)

  const pct = ((gzLean / BUDGET_GZIP) * 100).toFixed(0)
  console.log('')
  console.log('  punto/embed → apps/web/public/embed.js')
  console.log(`    css inyectado      ${kb(Buffer.byteLength(css, 'utf8'))} raw · ${kb(gzCss)} gzip`)
  console.log(`    bundle completo    ${kb(rawFull)} raw · ${kb(gzFull)} gzip  (incluye rrweb-snapshot)`)
  console.log(`    sin rrweb-snapshot ${kb(Buffer.byteLength(leanCode, 'utf8'))} raw · ${kb(gzLean)} gzip  → ${pct}% del presupuesto (${kb(BUDGET_GZIP)})`)
  console.log('')

  if (gzLean >= BUDGET_GZIP) {
    console.error(
      `\n  ✖ PRESUPUESTO EXCEDIDO (§3): ${kb(gzLean)} gzip sin rrweb-snapshot, el tope es ${kb(BUDGET_GZIP)}.\n`,
    )
    if (!watch) process.exit(1)
  }
}

if (watch) {
  const chokidarless = async () => {
    try {
      await run()
    } catch (error) {
      console.error(error)
    }
  }
  await chokidarless()
  const { watch: fsWatch } = await import('node:fs')
  fsWatch(join(HERE, 'src'), { recursive: true }, () => {
    void chokidarless()
  })
} else {
  rmSync(DIST, { recursive: true, force: true })
  await run()
}
