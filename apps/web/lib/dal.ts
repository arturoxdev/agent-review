import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { ACCESS_COOKIE, verifyAccess } from './access-token'
import { getAccountById } from './db/queries'

export type AccountDto = {
  id: string
  email: string
  createdAt: string
}

/** Verificación real del Acceso, memoizada por request y pegada a la Cuenta. */
export const requireAccount = cache(async (): Promise<AccountDto> => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value
  const access = await verifyAccess(token)
  if (access === null) redirect('/login')

  const account = await getAccountById(access.accountId)
  if (account === null) redirect('/login')

  return {
    id: account.id,
    email: account.email,
    createdAt: account.createdAt,
  }
})
