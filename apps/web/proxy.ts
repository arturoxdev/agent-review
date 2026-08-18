import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import {
  ACCESS_COOKIE,
  accessCookieOptions,
  accessExpiresAt,
  signAccess,
  verifyAccess,
} from '@/lib/access-token'

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const access = await verifyAccess(request.cookies.get(ACCESS_COOKIE)?.value)
  if (access === null) return NextResponse.redirect(new URL('/login', request.url))

  const expiresAt = accessExpiresAt()
  const response = NextResponse.next()
  response.cookies.set(
    ACCESS_COOKIE,
    await signAccess(access.accountId, expiresAt),
    accessCookieOptions(expiresAt),
  )
  return response
}

export const config = {
  matcher: '/app/:path*',
}
