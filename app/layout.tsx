import type { Metadata } from 'next'
import { Chakra_Petch } from 'next/font/google'
import './globals.css'

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={font.variable}>
      <body>{children}</body>
    </html>
  )
}