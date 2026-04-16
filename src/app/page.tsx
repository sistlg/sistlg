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
           .maybeSingle();
        
        if (dbErr || !atendente) {
          console.error("DB error:", dbErr);
          setAuthError(`Usuário reconhecido (${user.id.substring(0,8)}), mas perfil 'Atendente' não encontrado.`);
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
      const { data: ranking } = await supabase
        .from('atendentes')
        .select('*')
        .order('pontos_gamificacao', { ascending: false });
      if (ranking) setAtendentesRanking(ranking);

      const { count: total } = await supabase.from('conversas').select('*', { count: 'exact', head: true });
      const { data: csatData } = await supabase.from('pesquisas_satisfacao').select('nota');
      const avgCsat = csatData && csatData.length > 0 
        ? csatData.reduce((acc, curr) => acc + curr.nota, 0) / csatData.length 
        : 0;

      setMetrics({ totalAtendimentos: total || 0, csatMedio: avgCsat });

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
        <div className="w-16 border-r flex flex-col items-center py-6 bg-muted/10 shrink-0 h-full">
          <div className="flex-1 w-full flex flex-col items-center gap-6">
            <TabsList className="flex flex-col bg-transparent h-auto p-0 gap-4 w-full items-center">
              <TabsTrigger value="atendimento" className="p-2 h-10 w-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl transition-all shadow-sm">
                <Bot className="w-5 h-5" />
              </TabsTrigger>
              <TabsTrigger value="gerencial" className="p-2 h-10 w-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl transition-all shadow-sm">
                 <Trophy className="w-5 h-5" />
              </TabsTrigger>
              <TabsTrigger value="configuracoes" className="p-2 h-10 w-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl transition-all shadow-sm">
                 <Settings className="w-5 h-5" />
              </TabsTrigger>
            </TabsList>
            <Separator className="w-8 opacity-30" />
          </div>

          <div className="mt-auto flex flex-col items-center gap-4 w-full">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors" onClick={fazerLogout} title="Sair da Conta">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Conteúdo Aba Atendimento */}
        <TabsContent value="atendimento" className="flex-1 m-0 overflow-hidden flex flex-col focus-visible:outline-none">
          <div className="flex flex-1 overflow-hidden">
            <div className="w-1/3 max-w-sm border-r flex flex-col bg-card/30 backdrop-blur-sm">
              <div className="p-5 border-b flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-11 w-11 ring-2 ring-primary/10 shadow-md">
                    <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${perfilAtual?.nome || 'Admin'}`} />
                    <AvatarFallback className="bg-primary/5 text-primary font-bold">{perfilAtual?.nome?.charAt(0) || 'AT'}</AvatarFallback>
                  </Avatar>
                  <div className="overflow-hidden">
                    <h2 className="font-bold text-sm tracking-tight truncate">Painel SISTLG</h2>
                    <div className="text-[10px] flex items-center gap-2 mt-0.5">
                      {authError ? (
                        <div className="flex items-center gap-1 text-destructive font-bold bg-destructive/10 px-1.5 py-0.5 rounded">
                          <AlertCircle className="w-2.5 h-2.5" /> ERRO
                        </div>
                      ) : (
                        <span className={`w-2 h-2 rounded-full ${perfilAtual ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500 animate-pulse'}`}></span>
                      )}
                      <span className={`truncate max-w-[110px] font-medium ${authError ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {authError || perfilAtual?.nome || 'Identificando...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input placeholder="Buscar conversas..." className="pl-9 bg-muted/30 h-9 text-sm rounded-xl border-none focus-visible:ring-1 focus-visible:ring-primary/30" />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {conversas.length > 0 ? (
                  conversas.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => setConversaAtiva(conv)}
                      className={`p-4 cursor-pointer border-b hover:bg-muted/30 transition-all flex items-start gap-4 relative ${conversaAtiva?.id === conv.id ? 'bg-primary/5 border-r-4 border-r-primary' : ''}`}
                    >
                      <Avatar className="h-10 w-10 shadow-sm">
                        <AvatarFallback className="bg-primary/5 text-primary font-medium text-xs">{conv.clientes.nome.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold truncate text-sm">{conv.clientes.nome}</h3>
                          <span className="text-[10px] text-muted-foreground font-medium italic">
                            {conv.última_mensagem_at ? format(new Date(conv.última_mensagem_at), 'HH:mm') : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                           <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-bold uppercase tracking-tighter opacity-80">{conv.bots_config?.nome_bot}</Badge>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center text-muted-foreground space-y-4">
                    <div className="opacity-10 bg-muted p-6 rounded-full inline-block">
                      <Bot className="w-10 h-10" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold">Nenhuma conversa ativa</p>
                      <p className="text-[10px] max-w-[180px] mx-auto opacity-70">As mensagens recebidas no Telegram aparecerão aqui automaticamente.</p>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>

            {conversaAtiva ? (
              <div className="flex-1 flex flex-col bg-background">
                <div className="p-4 border-b flex items-center justify-between bg-card/20 backdrop-blur-md sticky top-0 z-10">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10 shadow-sm border">
                      <AvatarFallback className="bg-primary/10 text-primary font-black uppercase text-xs">{conversaAtiva.clientes.nome.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="font-bold text-base leading-none">{conversaAtiva.clientes.nome}</h2>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">@{conversaAtiva.clientes.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {conversaAtiva.status === 'aberto' ? (
                      <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/5 border-destructive/20 gap-2 h-8 px-4 font-bold text-[11px] rounded-xl" onClick={fecharAtendimento}>
                        <XCircle className="w-3.5 h-3.5" /> FINALIZAR
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="gap-1.5 h-7 px-3 font-black text-[9px] uppercase tracking-wider"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> ENCERRADO</Badge>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1 p-6">
                  <div className="flex flex-col gap-6 max-w-4xl mx-auto">
                    {mensagensUnificadas.map((msg, idx) => {
                      const isMine = msg.remetente !== 'cliente';
                      const isInterno = msg.contexto === 'interno';
                      
                      return (
                        <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                          <div className={`max-w-[75%] rounded-3xl px-5 py-3 shadow-sm relative ${
                            isInterno 
                              ? 'bg-yellow-500/5 border-yellow-500/30 text-yellow-900 dark:text-yellow-100 border-2 border-dashed'
                              : isMine 
                                ? 'bg-primary text-primary-foreground rounded-tr-none' 
                                : 'bg-card border-2 border-muted/30 rounded-tl-none'
                          }`}>
                            {(msg.remetente === 'bot' || isInterno) && (
                              <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5 ${isInterno ? 'text-yellow-600 dark:text-yellow-400' : isMine ? 'text-primary-foreground/70' : 'text-primary'}`}>
                                {isInterno ? <Users className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                                {isInterno ? 'Nota Interna / Equipe' : 'Resposta Automática'}
                              </div>
                            )}
                            <p className="text-sm leading-relaxed font-medium">{msg.conteudo}</p>
                            <span className="text-[9px] opacity-60 mt-2 flex items-center justify-end gap-2 font-mono italic">
                              {msg.sentimento && !isMine && <span>{getEmojiSentimento(msg.sentimento)}</span>}
                              {format(new Date(msg.created_at), 'HH:mm')}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>

                <div className={`p-5 bg-card/30 border-t backdrop-blur-sm relative transition-all duration-500 ${modoMensagem === 'interno' ? 'bg-yellow-500/5 ring-1 ring-inset ring-yellow-500/20' : ''}`}>
                  
                  {/* Seletor de Modo */}
                  <div className="flex items-center gap-2 mb-4">
                    <Button 
                      variant={modoMensagem === 'publico' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setModoMensagem('publico')}
                      className="text-[10px] h-7 px-4 rounded-full gap-1.5 font-bold uppercase tracking-tight"
                    >
                      <User className="w-3 h-3" /> PÚBLICO
                    </Button>
                    <Button 
                      variant={modoMensagem === 'interno' ? 'default' : 'ghost'} 
                      size="sm" 
                      onClick={() => setModoMensagem('interno')}
                      className={`text-[10px] h-7 px-4 rounded-full gap-1.5 font-bold uppercase tracking-tight ${modoMensagem === 'interno' ? 'bg-yellow-600 hover:bg-yellow-700' : 'text-yellow-600 hover:bg-yellow-500/10'}`}
                    >
                      <Users className="w-3 h-3" /> INTERNO
                    </Button>
                  </div>

                  {(sugestaoIA || carregandoIA) && modoMensagem === 'publico' && (
                    <div className="absolute bottom-full left-4 right-4 p-4 bg-primary/10 border border-primary/20 rounded-t-2xl flex items-start gap-4 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 shadow-lg ring-1 ring-primary/5">
                      <div className="mt-1 p-2 bg-primary/20 rounded-lg">
                         <Bot className={`w-5 h-5 text-primary ${carregandoIA ? 'animate-bounce' : ''}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">SUGESTÃO DA INTELIGÊNCIA ARTIFICIAL</p>
                        {carregandoIA ? <div className="h-4 w-40 bg-primary/20 animate-pulse rounded" /> : <p className="text-sm italic font-bold leading-tight">"{sugestaoIA}"</p>}
                      </div>
                      {!carregandoIA && <Button variant="secondary" size="sm" className="text-[10px] h-8 px-4 font-black shadow-sm" onClick={() => setNovaMensagem(sugestaoIA || '')}>APLICAR</Button>}
                    </div>
                  )}

                  <form onSubmit={enviarMensagem} className="flex gap-3 items-center max-w-5xl mx-auto">
                    <div className="relative flex-1 group">
                      <Input value={novaMensagem} onChange={(e) => setNovaMensagem(e.target.value)} placeholder="Type a message..." className="rounded-2xl pr-14 h-11 border-none bg-muted/40 shadow-inner group-focus-within:bg-card transition-all placeholder:font-medium text-sm" disabled={refinandoIA} />
                      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 text-primary hover:bg-primary/10 transition-colors" onClick={refinarMensagem} disabled={refinandoIA}>
                        <Sparkles className={`h-4.5 w-4.5 ${refinandoIA ? 'animate-spin' : ''}`} />
                      </Button>
                    </div>
                    <Button type="submit" size="icon" className="rounded-2xl h-11 w-11 shrink-0 shadow-lg shadow-primary/20 hover:scale-105 transition-transform" disabled={!novaMensagem.trim() || refinandoIA}><Send className="h-5 w-5" /></Button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-12 bg-muted/5">
                <div className="p-8 bg-card border-2 border-dashed rounded-[40px] flex flex-col items-center space-y-4 shadow-sm opacity-60">
                  <Bot className="w-16 h-16 text-primary/30" />
                  <div className="text-center space-y-1">
                    <p className="text-base font-black tracking-tight">CENTRAL DE SUPORTE SISTLG</p>
                    <p className="text-xs font-medium max-w-[240px] opacity-70">Aguardando interação. Selecione um atendimento ativo para iniciar o suporte humanizado.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Conteúdo Aba Gerencial */}
        <TabsContent value="gerencial" className="flex-1 overflow-y-auto m-0 p-10 focus-visible:outline-none">
           <div className="max-w-6xl mx-auto space-y-10">
             <div className="flex items-center justify-between border-b-2 pb-6">
                <div className="space-y-1">
                   <h1 className="text-4xl font-black tracking-tighter">INSIGHTS GERENCIAIS</h1>
                   <p className="text-muted-foreground font-medium">Análise de performance automatizada e IA.</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                   <Badge variant="outline" className="text-primary border-primary/40 font-black px-4 py-1.5 rounded-full text-[10px] tracking-widest flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span> LIVE MONITORING
                   </Badge>
                </div>
             </div>

             <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="p-6 space-y-4 border-2 border-primary/5 shadow-xl shadow-primary/[0.02] hover:scale-105 transition-transform duration-300">
                   <div className="flex items-center justify-between">
                      <div className="p-2.5 bg-primary/10 rounded-xl"><Users className="h-5 w-5 text-primary" /></div>
                      <Badge className="bg-green-500/10 text-green-600 border-none font-black text-[9px]">+12.4%</Badge>
                   </div>
                   <div className="space-y-1">
                     <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Atendimento Total</p>
                     <div className="text-4xl font-black tracking-tighter">{metrics.totalAtendimentos}</div>
                   </div>
                </Card>
                <Card className="p-6 space-y-4 border-2 border-transparent shadow-xl hover:border-yellow-500/20 transition-all duration-300">
                   <div className="flex items-center justify-between">
                      <div className="p-2.5 bg-yellow-500/10 rounded-xl"><Star className="h-5 w-5 text-yellow-600" /></div>
                      <div className="flex gap-0.5">
                         {[1,2,3].map(s => <Star key={s} className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />)}
                      </div>
                   </div>
                   <div className="space-y-1">
                     <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Satisfação (CSAT)</p>
                     <div className="text-4xl font-black tracking-tighter text-yellow-600">{metrics.csatMedio.toFixed(1)}<span className="text-lg opacity-40">/5</span></div>
                   </div>
                </Card>
                <Card className="p-6 space-y-4 border-2 border-transparent shadow-xl hover:border-blue-500/20 transition-all duration-300">
                   <div className="flex items-center justify-between">
                      <div className="p-2.5 bg-blue-500/10 rounded-xl"><Clock className="h-5 w-5 text-blue-600" /></div>
                      <Badge variant="outline" className="font-bold text-[9px]">SLA OK</Badge>
                   </div>
                   <div className="space-y-1">
                     <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tempo de Resposta</p>
                     <div className="text-4xl font-black tracking-tighter text-blue-600 decoration-blue-200">2m 45s</div>
                   </div>
                </Card>
                <Card className="p-6 space-y-4 border-2 border-primary shadow-2xl bg-primary text-primary-foreground shadow-primary/20 overflow-hidden relative group">
                   <TrendingUp className="absolute -right-4 -top-4 w-24 h-24 opacity-10 group-hover:scale-125 transition-transform duration-700" />
                   <div className="p-2.5 bg-white/20 rounded-xl w-fit"><TrendingUp className="h-5 w-5" /></div>
                   <div className="space-y-1">
                     <p className="text-[10px] font-black opacity-70 uppercase tracking-widest">Meta de Conversão</p>
                     <div className="text-4xl font-black tracking-tighter">94.8%</div>
                   </div>
                   <div className="h-1.5 w-full bg-white/20 rounded-full mt-2">
                       <div className="h-full bg-white w-[94%] shadow-[0_0_10px_white]" />
                   </div>
                </Card>
             </div>

             <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-7">
                <Card className="lg:col-span-4 p-8 border-none bg-card/60 shadow-2xl rounded-[32px] overflow-hidden">
                   <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)] rounded-2xl"><Trophy className="text-white w-6 h-6" /></div> 
                         <h2 className="text-2xl font-black tracking-tighter uppercase italic">Gamificação</h2>
                      </div>
                      <div className="text-[9px] font-black bg-muted px-4 py-1.5 rounded-full tracking-wider opacity-60">ATUALIZADO AGORA</div>
                   </div>
                   <Table>
                      <TableHeader><TableRow className="border-none hover:bg-transparent">
                        <TableHead className="w-[70px] font-black text-[10px] text-muted-foreground">#</TableHead>
                        <TableHead className="font-black text-[10px] text-muted-foreground">OPERADOR</TableHead>
                        <TableHead className="font-black text-[10px] text-muted-foreground">STATUS</TableHead>
                        <TableHead className="text-right font-black text-[10px] text-muted-foreground">XP / PONTOS</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                         {atendentesRanking.map((at, idx) => (
                            <TableRow key={at.id} className="border-b border-muted group hover:bg-muted/30 transition-all cursor-default">
                               <TableCell className={`font-black text-xl italic ${idx === 0 ? 'text-yellow-500 scale-125' : 'text-muted-foreground'}`}>{idx + 1}º</TableCell>
                               <TableCell>
                                  <div className="flex items-center gap-4">
                                     <Avatar className="h-10 w-10 ring-2 ring-primary/5 shadow-md">
                                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${at.nome}`} />
                                        <AvatarFallback className="bg-primary/5 font-bold">{at.nome.charAt(0)}</AvatarFallback>
                                     </Avatar>
                                     <span className="font-black text-sm tracking-tight">{at.nome}</span>
                                  </div>
                               </TableCell>
                               <TableCell>
                                 <div className={`w-3 h-3 rounded-full ${at.status === 'online' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-muted shadow-inner'}`} />
                               </TableCell>
                               <TableCell className="text-right font-mono font-black text-primary text-2xl tracking-tighter decoration-primary/20 underline underline-offset-8 decoration-wavy">{at.pontos_gamificacao}</TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                   </Table>
                </Card>

                <Card className="lg:col-span-3 p-8 border-none bg-card/60 shadow-2xl rounded-[32px]">
                   <div className="flex items-center gap-4 mb-10">
                      <div className="p-3 bg-primary shadow-lg shadow-primary/30 rounded-2xl"><BarChart3 className="text-white w-6 h-6" /></div> 
                      <h2 className="text-2xl font-black tracking-tighter uppercase italic">Ocupação Horária</h2>
                   </div>
                   <div className="h-[340px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={statsVolume}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.03} />
                            <XAxis dataKey="nome" axisLine={false} tickLine={false} fontSize={10} fontWeight="900" />
                            <YAxis axisLine={false} tickLine={false} fontSize={10} hide />
                            <ChartTooltip cursor={{fill: 'hsl(var(--primary)/0.03)'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 'bold', textTransform: 'uppercase' }} />
                            <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[12, 12, 0, 0]} className="transition-all duration-1000" barSize={24} />
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </Card>
             </div>
           </div>
        </TabsContent>

        {/* Conteúdo Aba Configurações */}
        <TabsContent value="configuracoes" className="flex-1 overflow-y-auto m-0 p-10 focus-visible:outline-none">
           <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in zoom-in-95 duration-500">
              <div className="space-y-2">
                 <h1 className="text-4xl font-black tracking-tighter uppercase italic">Configurações</h1>
                 <p className="text-muted-foreground font-medium">Gestão de infraestrutura e otimização de IA.</p>
              </div>

              <div className="grid gap-8">
                 <Card className="p-8 border-none bg-card shadow-xl rounded-[24px]">
                    <div className="flex items-center gap-3 mb-8">
                       <User className="w-5 h-5 text-primary" />
                       <h3 className="text-lg font-black tracking-tight uppercase">Meu Perfil de Atendimento</h3>
                    </div>
                    <div className="grid gap-8">
                       <div className="space-y-3">
                          <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">Nome de Exibição no Chat</label>
                          <Input defaultValue={perfilAtual?.nome} className="max-w-md h-12 rounded-xl focus:ring-primary/20 bg-muted/20 border-none font-bold" />
                       </div>
                       <div className="space-y-3">
                          <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">Status de Disponibilidade</label>
                          <div className="flex gap-3">
                             <Button size="lg" variant="outline" className="bg-green-500/10 border-green-200 text-green-700 font-bold rounded-xl h-12 px-8 hover:bg-green-500/20 active:scale-95 transition-all">DISPONÍVEL</Button>
                             <Button size="lg" variant="outline" className="font-bold rounded-xl h-12 px-8 active:scale-95 transition-all">EM PAUSA</Button>
                          </div>
                       </div>
                    </div>
                 </Card>

                 <Card className="p-8 border-none bg-card shadow-xl rounded-[24px]">
                    <div className="flex items-center gap-3 mb-8">
                       <Sparkles className="w-5 h-5 text-primary" />
                       <h3 className="text-lg font-black tracking-tight uppercase">Integrações Sistémicas</h3>
                    </div>
                    <div className="space-y-6">
                       <div className="flex items-center justify-between p-5 bg-muted/30 rounded-2xl border border-muted ring-1 ring-inset ring-white/5 shadow-inner">
                          <div className="flex items-center gap-4">
                             <div className="p-3 bg-white rounded-xl shadow-sm"><Bot className="w-6 h-6 text-primary" /></div>
                             <div>
                                <p className="text-sm font-black">CANAL TELEGRAM</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                   <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_green]"></div>
                                   <p className="text-[10px] font-black text-green-600 tracking-wider">ATIVO & MONITORANDO</p>
                                </div>
                             </div>
                          </div>
                          <Button variant="outline" className="font-black text-[10px] rounded-xl h-9 px-5 hover:bg-primary hover:text-white transition-all">TESTAR WEBHOOK</Button>
                       </div>
                       
                       <div className="flex items-center justify-between p-5 bg-muted/30 rounded-2xl border border-muted shadow-inner">
                          <div className="flex items-center gap-4">
                             <div className="p-3 bg-card border shadow-sm rounded-xl"><Sparkles className="w-6 h-6 text-primary" /></div>
                             <div>
                                <p className="text-sm font-black">AI CORE (OPENAI)</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                   <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                   <p className="text-[10px] font-black text-yellow-600 tracking-wider">AGUARDANDO CONFIGURAÇÃO</p>
                                </div>
                             </div>
                          </div>
                          <div className="flex gap-2">
                             <Input placeholder="OpenAI Secret Key..." className="max-w-[220px] h-10 rounded-xl bg-card border-none font-mono text-xs" type="password" />
                             <Button className="font-black text-[10px] rounded-xl h-10 px-5 shadow-lg shadow-primary/20">SALVAR</Button>
                          </div>
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
