import type { Metadata } from 'next'

import { AuthForm } from '../auth-form'

export const metadata: Metadata = { title: 'Registro · Punto', robots: { index: false } }

export default function SignupPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
      <AuthForm mode="signup" />
    </main>
  )
}
