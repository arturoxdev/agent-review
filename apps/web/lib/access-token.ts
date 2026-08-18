import { jwtVerify, SignJWT } from 'jose'

import { getEnv } from './env'

export const ACCESS_COOKIE = 'punto_access'
export const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60

export type AccessPayload = {
  accountId: string
  /** Epoch en segundos. También se refleja en el claim estándar `exp`. */
  expiresAt: number
}

function signingKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().SESSION_SECRET)
}

export function accessExpiresAt(now = Date.now()): number {
  return Math.floor(now / 1000) + ACCESS_TTL_SECONDS
}

export async function signAccess(accountId: string, expiresAt = accessExpiresAt()): Promise<string> {
  return new SignJWT({ accountId, expiresAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(signingKey())
}

export async function verifyAccess(token: string | undefined): Promise<AccessPayload | null> {
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'] })
    if (
      typeof payload.accountId !== 'string' ||
      typeof payload.expiresAt !== 'number' ||
      payload.exp !== payload.expiresAt
    ) {
      return null
    }
    return { accountId: payload.accountId, expiresAt: payload.expiresAt }
  } catch {
    return null
  }
}

export function accessCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    expires: new Date(expiresAt * 1000),
  }
}
