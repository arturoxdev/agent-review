/**
 * Piezas compartidas por los dos POST de captura (PRD §4.1).
 *
 * `POST /api/sessions` y `POST /api/sessions/:publicId/entries` mandan el mismo body
 * y devuelven el mismo `CreateEntryResponse`, así que la asignación de UUIDs y la
 * firma de las URLs de subida (15 min) viven aquí una sola vez.
 */
import type { CreateEntryRequest, CreateEntryResponse, Entry } from '@punto/contracts'

import { signedUploadUrl } from '../blob-token'
import type { EntryInput } from '../db/queries'
import { blobReadUrl } from '../env'
import { blobIdFromUrl, newBlobId } from './blob-store'

/**
 * Body validado → `EntryInput`, con `snapshotUrl`/`thumbnailUrl` ya asignados por UUID
 * (§4.1: la respuesta los trae aunque el blob todavía no exista).
 */
export function toEntryInput(body: CreateEntryRequest, idempotencyKey: string): EntryInput {
  return {
    url: body.url,
    pageTitle: body.pageTitle,
    viewport: body.viewport,
    annotations: body.annotations.map((annotation) => ({
      number: annotation.number,
      body: annotation.body,
      target: annotation.target,
      createdAt: annotation.createdAt,
    })),
    snapshotUrl: blobReadUrl(newBlobId()),
    thumbnailUrl: blobReadUrl(newBlobId()),
    idempotencyKey,
  }
}

/**
 * `CreateEntryResponse` a partir de la entry persistida.
 *
 * Reusa los UUIDs que la entry ya tiene, de modo que repetir el POST con la misma
 * `Idempotency-Key` **solo re-firma** las URLs de subida caducadas. Si la entry
 * reusada venía sin `snapshotUrl` (un `PATCH failed` previo lo limpia), se asigna
 * un UUID nuevo para que el reintento tenga a dónde subir.
 */
export async function buildCreateEntryResponse(publicId: string, entry: Entry): Promise<CreateEntryResponse> {
  const existingSnapshotId = blobIdFromUrl(entry.snapshotUrl)
  const existingThumbnailId = blobIdFromUrl(entry.thumbnailUrl)
  const snapshotId = existingSnapshotId ?? newBlobId()
  const thumbnailId = existingThumbnailId ?? newBlobId()

  const snapshotUrl = blobReadUrl(snapshotId)
  const thumbnailUrl = blobReadUrl(thumbnailId)

  // Si hubo que inventar un UUID (la entry venía de un `PATCH failed`, que limpia
  // `snapshotUrl`), hay que persistirlo: si no, el reintento sube a un blob que la
  // entry no conoce y el `PATCH ready` la dejaría `ready` sin snapshot.
  if (existingSnapshotId === null || existingThumbnailId === null) {
    const { setEntryBlobUrls } = await import('../db/queries')
    await setEntryBlobUrls(entry.id, {
      ...(existingSnapshotId === null ? { snapshotUrl } : {}),
      ...(existingThumbnailId === null ? { thumbnailUrl } : {}),
    })
  }

  const [snapshotUploadUrl, thumbnailUploadUrl] = await Promise.all([
    signedUploadUrl(snapshotId),
    signedUploadUrl(thumbnailId),
  ])

  return {
    publicId,
    entry: { ...entry, snapshotUrl, thumbnailUrl },
    snapshotUploadUrl,
    thumbnailUploadUrl,
  }
}
