// app/layout.tsx
import type { Metadata } from 'next'
import { Chakra_Petch } from 'next/font/google'
import './globals.css'
import { ToastContainer } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/server'
import { RealtimeToasts } from '@/components/RealtimeToasts'

const font = Chakra_Petch({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Play Zone',
  description: 'Play • Compete • Repeat',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <html lang="en" className={font.variable}>
      <body>
        {children}
        {user && <RealtimeToasts userId={user.id} />}
        <ToastContainer />
      </body>
    </html>
  )
}