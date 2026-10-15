import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request)

  const path = request.nextUrl.pathname

  // Public routes — login avasaram ledu
  const publicRoutes = ['/login', '/auth/callback', '/auth/signout']
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route))

  // Login cheyyaledu + public route kaadu → /login ki redirect
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Login chesadu + /login ki vellali anukuntunnadu → home ki redirect
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // /playzonemama route — admin role check
  if (user && path.startsWith('/playzonemama')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}