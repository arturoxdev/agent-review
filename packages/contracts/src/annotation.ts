import { z } from 'zod'

/** Rect absoluto respecto al documento, en px CSS. */
export const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})

export type Rect = z.infer<typeof rectSchema>

/** Las cuatro aristas de una capa del box model, en px CSS. */
export const edgesSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
})

export type Edges = z.infer<typeof edgesSchema>

// ---------- Anclaje de una anotación a un elemento ----------

export const boxModelSchema = z.object({
  content: rectSchema,
  padding: edgesSchema,
  border: edgesSchema,
  margin: edgesSchema,
})

export type BoxModel = z.infer<typeof boxModelSchema>

/** Cómo se resolvió el componente. La UI lo muestra como señal de confianza. */
export const resolvedBySchema = z.enum(['fiber', 'fiber-source', 'heuristic'])

export type ResolvedBy = z.infer<typeof resolvedBySchema>

export const annotationTargetSchema = z.object({
  /** Selector CSS único dentro del snapshot. Siempre presente. */
  selector: z.string(),
  /** id del nodo dentro del snapshot rrweb; es el anclaje preciso al rehidratar. */
  nodeId: z.number(),
  /** Rect absoluto respecto al documento, en px CSS. */
  rect: rectSchema,
  boxModel: boxModelSchema,
  /** Etiqueta HTML, p.ej. "button". */
  tag: z.string(),
  /** Texto visible recortado a 120 chars. Puede ser "". */
  text: z.string(),
  /** Nombre del componente React, si Fiber lo resolvió. */
  component: z.string().optional(),
  /** Pila de componentes de fuera hacia dentro. */
  componentStack: z.array(z.string()).optional(),
  /** "src/components/Button.tsx:24" — solo cuando React expone _debugSource. */
  source: z.string().optional(),
  /** Cómo se resolvió el componente. La UI lo muestra como señal de confianza. */
  resolvedBy: resolvedBySchema,
})

export type AnnotationTarget = z.infer<typeof annotationTargetSchema>

export const annotationSchema = z.object({
  id: z.string(),
  /** 1, 2, 3… único dentro de la entrada. Es lo que se pinta en el marcador. */
  number: z.number(),
  body: z.string(),
  target: annotationTargetSchema,
  /** ISO */
  createdAt: z.string(),
})

export type Annotation = z.infer<typeof annotationSchema>
