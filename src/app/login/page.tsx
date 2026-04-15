import { login } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Bot, Lock } from 'lucide-react'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/50 to-primary/5 p-4 font-sans">
      <Card className="w-full max-w-md backdrop-blur-xl bg-card/60 shadow-2xl border-primary/10">
        <CardHeader className="space-y-3 text-center pb-8 border-b border-primary/5">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-2">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">SISTLG</CardTitle>
          <CardDescription>Faça login para acessar o painel de atendimento premium.</CardDescription>
        </CardHeader>
        <CardContent className="pt-8">
          <form className="animate-in flex-1 flex flex-col w-full justify-center gap-4 text-foreground">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="email">
                  E-mail Corporativo
                </label>
                <Input
                  name="email"
                  placeholder="seu@email.com"
                  required
                  className="bg-background/50 border-primary/20 focus-visible:ring-primary/50"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="password">
                  Senha Segura
                </label>
                <div className="relative">
                  <Input
                    type="password"
                    name="password"
                    placeholder="••••••••"
                    required
                    className="bg-background/50 border-primary/20 focus-visible:ring-primary/50 pr-10"
                    autoComplete="current-password"
                  />
                  <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground opacity-50" />
                </div>
              </div>
            </div>
            
            {searchParams?.message && (
              <p className="mt-4 p-3 bg-destructive/10 text-destructive text-center rounded-md text-sm border border-destructive/20 font-medium">
                {searchParams.message}
              </p>
            )}

            <Button 
              formAction={login} 
              className="w-full mt-6 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
              size="lg"
            >
              Entrar no Workspace
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-primary/5 pt-6 text-sm text-muted-foreground">
          <p>Ambiente seguro e monitorado pela LGPD.</p>
        </CardFooter>
      </Card>
    </div>
  )
}
