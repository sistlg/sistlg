import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // 1. Defesa inicial: Se não houver chaves, permite passar para não dar erro 500 no site todo
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn("⚠️ ALERTA: NEXT_PUBLIC_SUPABASE_URL ou ANON_KEY não configuradas no ambiente (Vercel/Local). O sistema de autenticação não funcionará.");
    return NextResponse.next();
  }

  // Inicializa a resposta padrão (sem passar o request inteiro como objeto)
  let supabaseResponse = NextResponse.next()

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            // Atualiza os cookies no request para que as rotas subsequentes (Server Components) os vejam
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            
            // Em Next.js 16, para propagar mudanças no request upstream, usamos este padrão:
            supabaseResponse = NextResponse.next({
              request: {
                headers: request.headers,
              },
            })

            // Atualiza os cookies no response para o navegador
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
    console.error("❌ Erro crítico no Proxy SISTLG:", error);
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
