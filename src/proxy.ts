import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  console.log('Proxy running for:', request.nextUrl.pathname)
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
