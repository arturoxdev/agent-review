'use server'

import { compare, hash } from 'bcryptjs'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createAccessCookie } from '@/lib/access-cookie'
import { createAccount, getAccountByEmail } from '@/lib/db/queries'

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un correo válido.'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
})

export type AuthFormState = {
  errors?: { email?: string[]; password?: string[] }
  message?: string
}

const INVALID_CREDENTIALS = 'El correo o la contraseña no son correctos.'
const DUMMY_PASSWORD_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

function invalidFields(result: z.ZodError): AuthFormState {
  const errors: NonNullable<AuthFormState['errors']> = {}
  for (const issue of result.issues) {
    const field = issue.path[0]
    if (field === 'email') (errors.email ??= []).push(issue.message)
    if (field === 'password') (errors.password ??= []).push(issue.message)
  }
  return { errors }
}

export async function signup(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return invalidFields(parsed.error)

  try {
    const passwordHash = await hash(parsed.data.password, 10)
    const account = await createAccount(parsed.data.email, passwordHash)
    await createAccessCookie(account.id)
  } catch {
    return { message: 'No se pudo crear la cuenta. Revisa los datos o intenta con otro correo.' }
  }

  redirect('/app')
}

export async function login(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return invalidFields(parsed.error)

  const account = await getAccountByEmail(parsed.data.email)
  const valid = await compare(parsed.data.password, account?.passwordHash ?? DUMMY_PASSWORD_HASH)
  if (account === null || !valid) return { message: INVALID_CREDENTIALS }

  await createAccessCookie(account.id)
  redirect('/app')
}
