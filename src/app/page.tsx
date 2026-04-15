'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Send, MoreVertical, Search, Bot, User, Clock, Settings, Sparkles, XCircle, CheckCircle2, Trophy, BarChart3, TrendingUp, Star, Users, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { logout } from '@/app/logout/actions';


// Tipos baseados no banco
type Conversa = {
  id: string;
  status: string;
  última_mensagem_at: string;
  clientes: {
    nome: string;
    username: string;
  };
  bots_config: {
    nome_bot: string;
  };
};

type Mensagem = {
  id: string;
  remetente: 'cliente' | 'atendente' | 'bot' | 'sistema';
  conteudo: string;
  sentimento?: 'positivo' | 'negativo' | 'neutro';
  created_at: string;
  contexto?: 'publico' | 'interno'; // Adicionado para facilitar renderização unificada
};

type MensagemInterna = {
  id: string;
  conversa_id: string;
  atendente_id: string;
  conteudo: string;
  created_at: string;
  sentimento?: 'positivo' | 'negativo' | 'neutro';
};

export default function Dashboard() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [sugestaoIA, setSugestaoIA] = useState<string | null>(null);
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [refinandoIA, setRefinandoIA] = useState(false);
  const [atendentesRanking, setAtendentesRanking] = useState<any[]>([]);
  const [statsVolume, setStatsVolume] = useState<any[]>([]);
  const [modoMensagem, setModoMensagem] = useState<'publico' | 'interno'>('publico');
  const [mensagensInternas, setMensagensInternas] = useState<MensagemInterna[]>([]);
  const [perfilAtual, setPerfilAtual] = useState<{ id: string, nome: string } | null>(null);

  // Carregar lista de conversas e Perfil Ativo
  useEffect(() => {
    async function loadInitialData() {
      // Puxar sessão ativa
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;

      if (userId) {
        const { data: atendente } = await supabase
           .from('atendentes')
           .select('id, nome')
           .eq('id', userId)
           .single();
        if (atendente) setPerfilAtual(atendente);
      }

      const { data } = await supabase
        .from('conversas')
        .select(`
          *,
          clientes (nome, username),
          bots_config (nome_bot, atendente_id)
        `)
        .order('última_mensagem_at', { ascending: false });

      if (data) {
        // Filtrar conversas: Ver apenas as vinculadas ao atendente logado
        const filtradas = data.filter((c: any) => c.bots_config.atendente_id === userId);
        setConversas(filtradas);
        
        if (filtradas.length > 0 && !conversaAtiva) {
          setConversaAtiva(filtradas[0] as any);
        }
      }
    }
    loadInitialData();

    const channel = supabase
      .channel('public:conversas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, () => {
        loadInitialData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Carregar dados gerenciais
  useEffect(() => {
    async function fetchGerencial() {
      const { data: ranking } = await supabase
        .from('atendentes')
        .select('*')
        .order('pontos_gamificacao', { ascending: false });
      
      if (ranking) setAtendentesRanking(ranking);

      setStatsVolume([
        { nome: '08:00', volume: 12 },
        { nome: '10:00', volume: 45 },
        { nome: '12:00', volume: 38 },
        { nome: '14:00', volume: 56 },
        { nome: '16:00', volume: 22 },
        { nome: '18:00', volume: 89 },
        { nome: '20:00', volume: 67 },
        { nome: '22:00', volume: 15 },
      ]);
    }
    fetchGerencial();

    const channel = supabase
      .channel('public:atendentes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendentes' }, () => {
        fetchGerencial();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Carregar mensagens da conversa ativa
  useEffect(() => {
    if (!conversaAtiva) return;

    async function fetchMensagens() {
      const { data } = await supabase
        .from('mensagens')
        .select('*')
        .eq('conversa_id', conversaAtiva!.id)
        .order('created_at', { ascending: true });

      if (data) {
        setMensagens(data as Mensagem[]);
      }
    }
    fetchMensagens();

    async function fetchMensagensInternas() {
      const { data } = await supabase
        .from('mensagens_internas')
        .select('*')
        .eq('conversa_id', conversaAtiva!.id)
        .order('created_at', { ascending: true });

      if (data) {
        setMensagensInternas(data as MensagemInterna[]);
      }
    }
    fetchMensagensInternas();

    const channel = supabase
      .channel(`mensagens:${conversaAtiva.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${conversaAtiva.id}` },
        (payload) => {
          setMensagens((prev) => [...prev, payload.new as Mensagem]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensagens_internas', filter: `conversa_id=eq.${conversaAtiva.id}` },
        (payload) => {
          setMensagensInternas((prev) => [...prev, payload.new as MensagemInterna]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversaAtiva]);

  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !conversaAtiva) return;

    const mensagemTemp = novaMensagem;
    setNovaMensagem('');

    try {
      if (modoMensagem === 'interno') {
        await fetch('/api/messages/internal/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversaId: conversaAtiva.id, conteudo: mensagemTemp, atendenteId: perfilAtual?.id }),
        });
      } else {
        await fetch('/api/messages/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversaId: conversaAtiva.id, conteudo: mensagemTemp, atendenteId: perfilAtual?.id }),
        });
      }
    } catch (error) {
      console.error(error);
      setNovaMensagem(mensagemTemp);
    }
  };

  const fecharAtendimento = async () => {
    if (!conversaAtiva || !confirm('Encerrar atendimento?')) return;
    try {
      await fetch('/api/conversas/fechar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId: conversaAtiva.id }),
      });
    } catch (error) {
       console.error(error);
    }
  };

  const buscarSugestaoIA = async () => {
    if (!conversaAtiva) return;
    setCarregandoIA(true);
    setSugestaoIA(null);
    try {
      const resp = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId: conversaAtiva.id }),
      });
      const data = await resp.json();
      if (data.sugestao) setSugestaoIA(data.sugestao);
    } catch (error) {
       console.error(error);
    } finally {
      setCarregandoIA(false);
    }
  };

  const refinarMensagem = async () => {
    if (!novaMensagem.trim() || refinandoIA) return;
    setRefinandoIA(true);
    try {
      const resp = await fetch('/api/ai/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: novaMensagem }),
      });
      const data = await resp.json();
      if (data.refined) setNovaMensagem(data.refined);
    } catch (error) {
       console.error(error);
    } finally {
      setRefinandoIA(false);
    }
  };

  // Unificar e ordenar mensagens para renderização
  const mensagensUnificadas = [
    ...mensagens.map(m => ({ ...m, contexto: 'publico' as const })),
    ...mensagensInternas.map(m => ({ ...m, remetente: 'atendente' as const, contexto: 'interno' as const, sentimento: undefined }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  useEffect(() => {
    if (conversaAtiva && mensagens.length > 0) {
      const ultimaMsg = mensagens[mensagens.length - 1];
      if (ultimaMsg.remetente === 'cliente') {
        buscarSugestaoIA();
      }
    }
  }, [conversaAtiva, mensagens.length]);

  const getEmojiSentimento = (sentimento?: string) => {
    switch (sentimento) {
      case 'positivo': return '😊';
      case 'negativo': return '😟';
      case 'neutro': return '😐';
      default: return null;
    }
  };

  const fazerLogout = async () => {
    if (confirm('Deseja realmente sair do sistema?')) {
      await logout();
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden font-sans">
      <Tabs defaultValue="atendimento" className="flex flex-1 overflow-hidden">
        
        {/* Barra Lateral de Navegação (Menu) */}
        <div className="w-16 border-r flex flex-col items-center py-4 gap-4 bg-muted/20 justify-between">
          <TabsList className="flex-col bg-transparent h-auto gap-4">
            <TabsTrigger value="atendimento" className="p-2 h-10 w-10">
              <Bot className="w-5 h-5" />
            </TabsTrigger>
            <TabsTrigger value="gerencial" className="p-2 h-10 w-10">
               <Trophy className="w-5 h-5" />
            </TabsTrigger>
            <Separator className="w-8" />
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Settings className="w-5 h-5" />
            </Button>
          </TabsList>

          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={fazerLogout} title="Sair da Conta">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {/* Conteúdo Aba Atendimento */}
        <TabsContent value="atendimento" className="flex-1 flex m-0 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            <div className="w-1/3 max-w-sm border-r flex flex-col bg-card">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="ring-2 ring-primary/20">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${perfilAtual?.nome || 'Admin'}`} />
                    <AvatarFallback>{perfilAtual?.nome?.charAt(0) || 'AT'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold text-sm">Painel SISTLG</h2>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span> {perfilAtual?.nome || 'Logando...'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar conversas..." className="pl-9 bg-muted/50" />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {conversas.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setConversaAtiva(conv)}
                    className={`p-4 cursor-pointer border-b hover:bg-accent transition-colors flex items-start gap-4 ${conversaAtiva?.id === conv.id ? 'bg-accent' : ''}`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">{conv.clientes.nome.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium truncate text-sm">{conv.clientes.nome}</h3>
                        <span className="text-xs text-muted-foreground">
                          {conv.última_mensagem_at ? format(new Date(conv.última_mensagem_at), 'HH:mm') : ''}
                        </span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] mt-1">{conv.bots_config?.nome_bot}</Badge>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </div>

            {conversaAtiva ? (
              <div className="flex-1 flex flex-col bg-background/95">
                <div className="p-4 border-b flex items-center justify-between bg-card/50 backdrop-blur-sm">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/20">{conversaAtiva.clientes.nome.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="font-semibold">{conversaAtiva.clientes.nome}</h2>
                      <p className="text-xs text-muted-foreground">@{conversaAtiva.clientes.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conversaAtiva.status === 'aberto' ? (
                      <Button variant="outline" size="sm" className="text-destructive gap-2" onClick={fecharAtendimento}>
                        <XCircle className="w-4 h-4" /> Finalizar
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> ENCERRADO</Badge>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <div className="flex flex-col gap-4">
                    {mensagensUnificadas.map((msg, idx) => {
                      const isMine = msg.remetente !== 'cliente';
                      const isInterno = msg.contexto === 'interno';
                      
                      return (
                        <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
                            isInterno 
                              ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-900 dark:text-yellow-200 border-2 border-dashed'
                              : isMine 
                                ? 'bg-primary text-primary-foreground rounded-br-sm' 
                                : 'bg-card border rounded-bl-sm'
                          }`}>
                            {(msg.remetente === 'bot' || isInterno) && (
                              <p className={`text-[10px] opacity-70 mb-1 flex items-center gap-1 ${isInterno ? 'font-bold uppercase text-yellow-600 dark:text-yellow-400' : ''}`}>
                                {isInterno ? <Users className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                                {isInterno ? 'Nota Interna / Equipe' : 'Auto'}
                              </p>
                            )}
                            <p className="text-sm">{msg.conteudo}</p>
                            <span className="text-[10px] opacity-60 mt-1 flex items-center justify-end gap-1">
                              {msg.sentimento && !isMine && <span>{getEmojiSentimento(msg.sentimento)}</span>}
                              {format(new Date(msg.created_at), 'HH:mm')}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>

                <div className={`p-4 bg-card border-t relative transition-colors duration-300 ${modoMensagem === 'interno' ? 'bg-yellow-500/5' : ''}`}>
                  
                  {/* Seletor de Modo */}
                  <div className="flex items-center gap-2 mb-3">
                    <Button 
                      variant={modoMensagem === 'publico' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setModoMensagem('publico')}
                      className="text-[10px] h-7 rounded-full gap-1"
                    >
                      <User className="w-3 h-3" /> Resposta para Cliente
                    </Button>
                    <Button 
                      variant={modoMensagem === 'interno' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setModoMensagem('interno')}
                      className={`text-[10px] h-7 rounded-full gap-1 ${modoMensagem === 'interno' ? 'bg-yellow-600 hover:bg-yellow-700' : 'text-yellow-600'}`}
                    >
                      <Users className="w-3 h-3" /> Nota Interna (Equipe)
                    </Button>
                  </div>

                  {(sugestaoIA || carregandoIA) && modoMensagem === 'publico' && (
                    <div className="absolute bottom-full left-0 right-0 p-3 bg-primary/5 border-t flex items-center gap-3 backdrop-blur-md">
                      <Bot className={`w-5 h-5 text-primary ${carregandoIA ? 'animate-bounce' : ''}`} />
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-primary">Sugestão da IA</p>
                        {carregandoIA ? <div className="h-4 w-32 bg-primary/20 animate-pulse rounded" /> : <p className="text-xs italic">"{sugestaoIA}"</p>}
                      </div>
                      {!carregandoIA && <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => setNovaMensagem(sugestaoIA || '')}>Usar</Button>}
                    </div>
                  )}

                  <form onSubmit={enviarMensagem} className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Input value={novaMensagem} onChange={(e) => setNovaMensagem(e.target.value)} placeholder="Digite..." className="rounded-full pr-12" disabled={refinandoIA} />
                      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={refinarMensagem} disabled={refinandoIA}>
                        <Sparkles className={`h-4 w-4 ${refinandoIA ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    <Button type="submit" size="icon" className="rounded-full h-9 w-9" disabled={!novaMensagem.trim()}><Send className="h-4 w-4" /></Button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">Selecione uma conversa</div>
            )}
          </div>
        </TabsContent>

        {/* Conteúdo Aba Gerencial */}
        <TabsContent value="gerencial" className="flex-1 overflow-y-auto m-0 p-8">
           <div className="max-w-6xl mx-auto space-y-8">
             <div className="flex items-center justify-between">
                <div>
                   <h1 className="text-3xl font-bold tracking-tight">Dashboard Gerencial</h1>
                   <p className="text-muted-foreground">Visualize o desempenho da equipe e métricas de satisfação.</p>
                </div>
                <Badge variant="outline" className="text-primary border-primary font-bold animate-pulse">LIVE</Badge>
             </div>

             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="p-6 space-y-2 border-primary/10 shadow-lg shadow-primary/5">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase">Atendimento Total</p>
                      <Users className="h-4 w-4 text-primary" />
                   </div>
                   <div className="text-2xl font-bold">1.284</div>
                   <p className="text-xs text-green-500">+12% hoje</p>
                </Card>
                <Card className="p-6 space-y-2">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase">CSAT Médio</p>
                      <Star className="h-4 w-4 text-yellow-500" />
                   </div>
                   <div className="text-2xl font-bold">4.8 / 5.0</div>
                   <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(s => <Star key={s} className="h-3 w-3 fill-yellow-500 text-yellow-500" />)}
                   </div>
                </Card>
                <Card className="p-6 space-y-2">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase">T. Médio Resposta</p>
                      <Clock className="h-4 w-4 text-primary" />
                   </div>
                   <div className="text-2xl font-bold">2m 45s</div>
                   <p className="text-xs text-green-500 font-medium">-15s vs meta</p>
                </Card>
                <Card className="p-6 space-y-2 shadow-inner bg-primary/5">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-primary uppercase">Conversão</p>
                      <TrendingUp className="h-4 w-4 text-primary" />
                   </div>
                   <div className="text-2xl font-bold">94%</div>
                   <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[94%]" />
                   </div>
                </Card>
             </div>

             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="lg:col-span-4 p-6 border-primary/20 bg-card/50">
                   <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                         <Trophy className="text-yellow-500" /> Ranking Gamificado
                      </h2>
                   </div>
                   <Table>
                      <TableHeader><TableRow>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>Atendente</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Pontos</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                         {atendentesRanking.map((at, idx) => (
                            <TableRow key={at.id} className="hover:bg-primary/5 group">
                               <TableCell className="font-bold text-muted-foreground">{idx + 1}º</TableCell>
                               <TableCell>
                                  <div className="flex items-center gap-3">
                                     <Avatar className="h-8 w-8 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                                        <AvatarFallback className="bg-primary/10 font-bold">{at.nome.charAt(0)}</AvatarFallback>
                                     </Avatar>
                                     <span className="font-semibold">{at.nome}</span>
                                  </div>
                               </TableCell>
                               <TableCell><Badge variant={at.status === 'online' ? 'default' : 'secondary'}>{at.status}</Badge></TableCell>
                               <TableCell className="text-right font-mono font-black text-primary text-base">{at.pontos_gamificacao}</TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                   </Table>
                </Card>

                <Card className="lg:col-span-3 p-6 border-primary/10">
                   <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="text-primary" /> Volume por Hora
                   </h2>
                   <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={statsVolume}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} />
                            <XAxis dataKey="nome" axisLine={false} tickLine={false} fontSize={10} />
                            <YAxis axisLine={false} tickLine={false} fontSize={10} hide />
                            <ChartTooltip cursor={{fill: 'hsl(var(--primary)/0.1)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </Card>
             </div>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
