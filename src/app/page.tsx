'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Send, MoreVertical, Search, Bot, User, Clock, Settings, Sparkles, XCircle, CheckCircle2, Trophy, BarChart3, TrendingUp, Star, Users, LogOut, AlertCircle } from 'lucide-react';
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
  contexto?: 'publico' | 'interno';
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
  const supabase = createClient();
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
  const [metrics, setMetrics] = useState({ totalAtendimentos: 0, csatMedio: 0 });
  const [authError, setAuthError] = useState<string | null>(null);

  // 1. Gerenciar Status Online e Carregar Perfil
  useEffect(() => {
    async function setupDashboard() {
      try {
        const { data: { user }, error: authErr } = await supabase.auth.getUser();
        
        if (authErr || !user) {
          console.error("Auth error:", authErr);
          setAuthError("Sessão não encontrada. Por favor, faça login novamente.");
          return;
        }

        const { data: atendente, error: dbErr } = await supabase
           .from('atendentes')
           .select('id, nome')
           .eq('id', user.id)
           .single();
        
        if (dbErr || !atendente) {
          console.error("DB error:", dbErr);
          setAuthError(`Usuário reconhecido (${user.id.substring(0,8)}), mas perfil 'Atendente' não encontrado no banco.`);
          return;
        }

        setPerfilAtual(atendente);
        setAuthError(null);
        // Marcar como online
        await supabase.from('atendentes').update({ status: 'online' }).eq('id', atendente.id);
      } catch (err) {
        setAuthError("Erro inesperado ao carregar perfil.");
      }
    }
    setupDashboard();

    // Offline ao sair
    const handleTabClose = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('atendentes').update({ status: 'offline' }).eq('id', user.id);
      }
    };
    window.addEventListener('beforeunload', handleTabClose);
    return () => window.removeEventListener('beforeunload', handleTabClose);
  }, []);

  // 2. Carregar lista de conversas
  useEffect(() => {
    async function loadConversas() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('conversas')
        .select(`
          *,
          clientes (nome, username),
          bots_config (nome_bot, atendente_id)
        `)
        .order('última_mensagem_at', { ascending: false });

      if (data) {
        const filtradas = data.filter((c: any) => c.bots_config.atendente_id === user.id);
        setConversas(filtradas);
        if (filtradas.length > 0 && !conversaAtiva) {
          setConversaAtiva(filtradas[0] as any);
        }
      }
    }
    loadConversas();

    const channel = supabase
      .channel('public:conversas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, () => {
        loadConversas();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversaAtiva]);

  // 3. Carregar dados gerenciais (Reais)
  useEffect(() => {
    async function fetchGerencial() {
      // Ranking
      const { data: ranking } = await supabase
        .from('atendentes')
        .select('*')
        .order('pontos_gamificacao', { ascending: false });
      if (ranking) setAtendentesRanking(ranking);

      // Métricas Consolidadas (Reais)
      const { count: total } = await supabase.from('conversas').select('*', { count: 'exact', head: true });
      const { data: csatData } = await supabase.from('pesquisas_satisfacao').select('nota');
      const avgCsat = csatData && csatData.length > 0 
        ? csatData.reduce((acc, curr) => acc + curr.nota, 0) / csatData.length 
        : 0;

      setMetrics({ totalAtendimentos: total || 0, csatMedio: avgCsat });

      // Volume por Hora Real (Últimas 24h)
      const { data: msgVolume } = await supabase
        .from('mensagens')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (msgVolume) {
        const hours = Array.from({ length: 12 }, (_, i) => {
          const hour = (new Date().getHours() - (11 - i) + 24) % 24;
          const label = `${hour.toString().padStart(2, '0')}:00`;
          const count = msgVolume.filter(m => new Date(m.created_at).getHours() === hour).length;
          return { nome: label, volume: count };
        });
        setStatsVolume(hours);
      }
    }
    fetchGerencial();

    const channel = supabase
      .channel('realtime:stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendentes' }, () => fetchGerencial())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, () => fetchGerencial())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
        <div className="w-16 border-r flex flex-col items-center py-6 bg-muted/20 justify-between shrink-0">
          <div className="flex flex-col items-center gap-6 w-full">
            <TabsList className="flex flex-col bg-transparent h-auto p-0 gap-4">
              <TabsTrigger value="atendimento" className="p-2 h-10 w-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all">
                <Bot className="w-5 h-5" />
              </TabsTrigger>
              <TabsTrigger value="gerencial" className="p-2 h-10 w-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all">
                 <Trophy className="w-5 h-5" />
              </TabsTrigger>
              <TabsTrigger value="configuracoes" className="p-2 h-10 w-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all">
                 <Settings className="w-5 h-5" />
              </TabsTrigger>
            </TabsList>
            
            <Separator className="w-8 opacity-50" />
          </div>

          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg" onClick={fazerLogout} title="Sair da Conta">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {/* Conteúdo Aba Atendimento */}
        <TabsContent value="atendimento" className="flex-1 m-0 overflow-hidden flex flex-col focus-visible:outline-none focus-visible:ring-0">
          <div className="flex flex-1 overflow-hidden">
            <div className="w-1/3 max-w-sm border-r flex flex-col bg-card">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="ring-2 ring-primary/20">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${perfilAtual?.nome || 'Admin'}`} />
                    <AvatarFallback>{perfilAtual?.nome?.charAt(0) || 'AT'}</AvatarFallback>
                  </Avatar>
                  <div className="overflow-hidden">
                    <h2 className="font-semibold text-sm truncate">Painel SISTLG</h2>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      {authError ? (
                        <span className="text-destructive flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> Erro</span>
                      ) : (
                        <span className={`w-2 h-2 rounded-full ${perfilAtual ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></span>
                      )}
                      <span className="truncate max-w-[120px]">
                        {authError || perfilAtual?.nome || 'Logando...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar conversas..." className="pl-9 bg-muted/50 h-9 text-sm" />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {conversas.length > 0 ? (
                  conversas.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => setConversaAtiva(conv)}
                      className={`p-4 cursor-pointer border-b hover:bg-accent transition-colors flex items-start gap-4 ${conversaAtiva?.id === conv.id ? 'bg-accent border-r-4 border-r-primary' : ''}`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">{conv.clientes.nome.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium truncate text-sm">{conv.clientes.nome}</h3>
                          <span className="text-[10px] text-muted-foreground">
                            {conv.última_mensagem_at ? format(new Date(conv.última_mensagem_at), 'HH:mm') : ''}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 mt-1">{conv.bots_config?.nome_bot}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground space-y-2">
                    <Bot className="w-8 h-8 mx-auto opacity-20" />
                    <p className="text-xs">Nenhuma conversa encontrada para o seu robô.</p>
                  </div>
                )}
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
                      <Button variant="outline" size="sm" className="text-destructive gap-2 h-8" onClick={fecharAtendimento}>
                        <XCircle className="w-4 h-4" /> Finalizar
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="gap-1 h-6"><CheckCircle2 className="w-3 h-3" /> ENCERRADO</Badge>
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
                    <div className="absolute bottom-full left-0 right-0 p-3 bg-primary/5 border-t flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-bottom-2">
                      <Bot className={`w-5 h-5 text-primary ${carregandoIA ? 'animate-bounce' : ''}`} />
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-primary uppercase">Sugestão da IA</p>
                        {carregandoIA ? <div className="h-4 w-32 bg-primary/20 animate-pulse rounded" /> : <p className="text-xs italic font-medium">"{sugestaoIA}"</p>}
                      </div>
                      {!carregandoIA && <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={() => setNovaMensagem(sugestaoIA || '')}>Usar</Button>}
                    </div>
                  )}

                  <form onSubmit={enviarMensagem} className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Input value={novaMensagem} onChange={(e) => setNovaMensagem(e.target.value)} placeholder="Digite sua mensagem..." className="rounded-full pr-12 h-10" disabled={refinandoIA} />
                      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={refinarMensagem} disabled={refinandoIA}>
                        <Sparkles className={`h-4 w-4 ${refinandoIA ? 'animate-spin' : 'text-primary'}`} />
                      </Button>
                    </div>
                    <Button type="submit" size="icon" className="rounded-full h-10 w-10 shrink-0" disabled={!novaMensagem.trim()}><Send className="h-4 w-4" /></Button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
                <div className="p-4 bg-muted rounded-full">
                  <Bot className="w-12 h-12 opacity-20" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Bem-vindo ao Dashboard SISTLG</p>
                  <p className="text-xs opacity-60">Selecione uma conversa ao lado para começar o atendimento.</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Conteúdo Aba Gerencial */}
        <TabsContent value="gerencial" className="flex-1 overflow-y-auto m-0 p-8 focus-visible:outline-none focus-visible:ring-0">
           <div className="max-w-6xl mx-auto space-y-8">
             <div className="flex items-center justify-between">
                <div>
                   <h1 className="text-3xl font-bold tracking-tight">Dashboard Gerencial</h1>
                   <p className="text-muted-foreground italic">Monitoramento em tempo real de performance e satisfação.</p>
                </div>
                <Badge variant="outline" className="text-primary border-primary font-bold animate-pulse px-3 py-1">REALTIME FEED</Badge>
             </div>

             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="p-6 space-y-2 border-primary/10 shadow-lg shadow-primary/5 hover:border-primary/30 transition-all cursor-default">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Atendimento Total</p>
                      <Users className="h-4 w-4 text-primary" />
                   </div>
                   <div className="text-3xl font-black">{metrics.totalAtendimentos}</div>
                   <p className="text-xs text-green-500 font-bold flex items-center gap-1">
                     <TrendingUp className="w-3 h-3" /> +12% vs ontem
                   </p>
                </Card>
                <Card className="p-6 space-y-2 border-transparent shadow-md hover:border-yellow-500/20 transition-all">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">CSAT Médio</p>
                      <Star className="h-4 w-4 text-yellow-500" />
                   </div>
                   <div className="text-3xl font-black text-yellow-600">{metrics.csatMedio.toFixed(1)} <span className="text-sm text-muted-foreground font-medium">/ 5.0</span></div>
                   <div className="flex gap-1 mt-1">
                      {[1,2,3,4,5].map(s => <Star key={s} className={`h-3 w-3 ${s <= Math.round(metrics.csatMedio) ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground/30'}`} />)}
                   </div>
                </Card>
                <Card className="p-6 space-y-2 border-transparent shadow-md">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">T. Médio Resposta</p>
                      <Clock className="h-4 w-4 text-blue-500" />
                   </div>
                   <div className="text-3xl font-black text-blue-600 font-mono">2m 45s</div>
                   <p className="text-xs text-green-500 font-bold">-15s abaixo da meta</p>
                </Card>
                <Card className="p-6 space-y-2 shadow-inner bg-primary/5 border-primary/10">
                   <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-primary uppercase tracking-widest">Conversão</p>
                      <TrendingUp className="h-4 w-4 text-primary" />
                   </div>
                   <div className="text-3xl font-black text-primary">94%</div>
                   <div className="h-2 w-full bg-muted rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-primary w-[94%] transition-all duration-1000" />
                   </div>
                </Card>
             </div>

             <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card className="lg:col-span-4 p-6 border-primary/10 bg-card/50 shadow-sm overflow-hidden">
                   <div className="flex items-center justify-between mb-8">
                      <h2 className="text-xl font-black flex items-center gap-3 tracking-tight">
                         <div className="p-2 bg-yellow-500/10 rounded-lg"><Trophy className="text-yellow-600 w-5 h-5" /></div> 
                         RANKING GAMIFICADO
                      </h2>
                      <Badge variant="outline" className="rounded-full">EQUIPE ATIVA</Badge>
                   </div>
                   <Table>
                      <TableHeader><TableRow className="border-b-2">
                        <TableHead className="w-[60px] font-bold">POS</TableHead>
                        <TableHead className="font-bold">ATENDENTE</TableHead>
                        <TableHead className="font-bold">STATUS</TableHead>
                        <TableHead className="text-right font-bold">SCORE</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                         {atendentesRanking.map((at, idx) => (
                            <TableRow key={at.id} className="hover:bg-primary/[0.02] border-b transition-colors group">
                               <TableCell className={`font-black text-base ${idx === 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>{idx + 1}º</TableCell>
                               <TableCell>
                                  <div className="flex items-center gap-3">
                                     <Avatar className="h-9 w-9 ring-2 ring-transparent group-hover:ring-primary/20 transition-all duration-300">
                                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${at.nome}`} />
                                        <AvatarFallback className="bg-primary/10 font-bold">{at.nome.charAt(0)}</AvatarFallback>
                                     </Avatar>
                                     <span className="font-bold text-sm">{at.nome}</span>
                                  </div>
                               </TableCell>
                               <TableCell>
                                 <Badge variant={at.status === 'online' ? 'default' : 'secondary'} className={`uppercase text-[9px] font-black ${at.status === 'online' ? 'bg-green-600 hover:bg-green-700' : ''}`}>
                                   {at.status}
                                 </Badge>
                               </TableCell>
                               <TableCell className="text-right font-mono font-black text-primary text-xl tracking-tighter">{at.pontos_gamificacao}</TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                   </Table>
                </Card>

                <Card className="lg:col-span-3 p-6 border-primary/10 shadow-sm bg-card/50">
                   <h2 className="text-xl font-black mb-8 flex items-center gap-3 tracking-tight">
                      <div className="p-2 bg-primary/10 rounded-lg"><BarChart3 className="text-primary w-5 h-5" /></div> 
                      VOLUME POR HORA
                   </h2>
                   <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={statsVolume}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.05} />
                            <XAxis dataKey="nome" axisLine={false} tickLine={false} fontSize={10} fontWeight="bold" />
                            <YAxis axisLine={false} tickLine={false} fontSize={10} hide />
                            <ChartTooltip cursor={{fill: 'hsl(var(--primary)/0.05)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }} />
                            <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} className="transition-all duration-1000" />
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </Card>
             </div>
           </div>
        </TabsContent>

        {/* Conteúdo Aba Configurações */}
        <TabsContent value="configuracoes" className="flex-1 overflow-y-auto m-0 p-8 focus-visible:outline-none focus-visible:ring-0">
           <div className="max-w-4xl mx-auto space-y-8">
              <div>
                 <h1 className="text-3xl font-bold tracking-tight">Configurações do Sistema</h1>
                 <p className="text-muted-foreground">Gerencie parâmetros globais e integração com IA.</p>
              </div>

              <div className="grid gap-6">
                 <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Perfil do Atendente</h3>
                    <div className="space-y-4">
                       <div className="space-y-2">
                          <label className="text-sm font-medium">Nome de Exibição</label>
                          <Input defaultValue={perfilAtual?.nome} className="max-w-md" />
                       </div>
                       <div className="space-y-2">
                          <label className="text-sm font-medium">Status de Atendimento</label>
                          <div className="flex gap-2">
                             <Button size="sm" variant="outline" className="bg-green-50/50 border-green-200 text-green-700">Disponível</Button>
                             <Button size="sm" variant="outline">Em Pausa</Button>
                          </div>
                       </div>
                    </div>
                 </Card>

                 <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Integridade do Sistema</h3>
                    <div className="space-y-4">
                       <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                             <Bot className="w-5 h-5 text-primary" />
                             <div>
                                <p className="text-sm font-medium">Conexão Telegram</p>
                                <p className="text-xs text-muted-foreground uppercase font-black text-green-600">Conectado</p>
                             </div>
                          </div>
                          <Button variant="outline" size="sm">Testar Webhook</Button>
                       </div>
                       
                       <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                             <Sparkles className="w-5 h-5 text-primary" />
                             <div>
                                <p className="text-sm font-medium">Motor de IA (OpenAI)</p>
                                <p className="text-xs text-muted-foreground uppercase font-black text-yellow-600">Aguardando Chave</p>
                             </div>
                          </div>
                          <Input placeholder="Insira seu Token..." className="max-w-[200px]" type="password" />
                       </div>
                    </div>
                 </Card>
              </div>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
