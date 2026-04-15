import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Defesa inicial: Se não houver chaves, permite passar para não dar erro 500 no site todo
  // Isso permite que a página carregue (mesmo que sem dados) e não interrompa a análise do desenvolvedor em produção.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("⚠️ ALERTA: NEXT_PUBLIC_SUPABASE_URL ou ANON_KEY não configuradas no ambiente (Vercel/Local). O sistema de autenticação não funcionará.");
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Verifica o usuário (importante: não remover isso, pois renova o token da sessão automaticamente)
    const { data: { user } } = await supabase.auth.getUser()

    // 2. Lógica de proteção de rotas
    const isLoginPage = request.nextUrl.pathname.startsWith('/login')
    const isDashboard = request.nextUrl.pathname === '/'

    // Se não estiver logado e tentar acessar o Dashboard (/) -> Redireciona para /login
    if (!user && isDashboard) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Se já estiver logado e tentar acessar /login -> Redireciona para o Dashboard (/)
    if (user && isLoginPage) {
      return NextResponse.redirect(new URL('/', request.url))
    }

  } catch (error) {
    console.error("❌ Erro crítico no Middleware SISTLG:", error);
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
