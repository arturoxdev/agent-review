import 'server-only'

import { cookies } from 'next/headers'

import {
  ACCESS_COOKIE,
  accessCookieOptions,
  accessExpiresAt,
  signAccess,
} from './access-token'

export async function createAccessCookie(accountId: string): Promise<void> {
  const expiresAt = accessExpiresAt()
  const token = await signAccess(accountId, expiresAt)
  const store = await cookies()
  store.set(ACCESS_COOKIE, token, accessCookieOptions(expiresAt))
}

export async function deleteAccessCookie(): Promise<void> {
  const store = await cookies()
  store.delete(ACCESS_COOKIE)
}
