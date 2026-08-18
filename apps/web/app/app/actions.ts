'use server'

import { compare, hash } from 'bcryptjs'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { deleteAccessCookie } from '@/lib/access-cookie'
import { requireAccount } from '@/lib/dal'
import {
  createProject,
  getAccountById,
  updateAccountPassword,
} from '@/lib/db/queries'

const projectNameSchema = z.string().trim().min(1, 'El nombre del proyecto no puede ir vacío.').max(120)

export type CreateProjectState = { projectId?: string; message?: string }

export async function createProjectAction(
  _previous: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const account = await requireAccount()
  const parsed = projectNameSchema.safeParse(formData.get('name'))
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? 'Nombre inválido.' }

  const keyEnv = process.env.NODE_ENV === 'production' ? 'live' : 'dev'
  const project = await createProject(account.id, parsed.data, { keyEnv })
  return { projectId: project.id }
}

export type ChangePasswordState = {
  errors?: { currentPassword?: string[]; newPassword?: string[] }
  message?: string
  success?: boolean
}

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual.'),
  newPassword: z.string().min(8, 'La contraseña nueva debe tener al menos 8 caracteres.'),
})

export async function changePasswordAction(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const account = await requireAccount()
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  })
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors
    return {
      errors: {
        currentPassword: errors.currentPassword,
        newPassword: errors.newPassword,
      },
    }
  }

  const stored = await getAccountById(account.id)
  if (stored === null || !(await compare(parsed.data.currentPassword, stored.passwordHash))) {
    return { errors: { currentPassword: ['La contraseña actual no es correcta.'] } }
  }

  const passwordHash = await hash(parsed.data.newPassword, 10)
  if (!(await updateAccountPassword(account.id, passwordHash))) {
    return { message: 'No se pudo cambiar la contraseña.' }
  }

  return { success: true, message: 'Contraseña actualizada.' }
}

export async function logoutAction(): Promise<never> {
  await requireAccount()
  await deleteAccessCookie()
  redirect('/login')
}
