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
  const [activeTab, setActiveTab] = useState('atendimento');
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
          setAuthError("Sessão não encontrada.");
          return;
        }

        const { data: atendente, error: dbErr } = await supabase
           .from('atendentes')
           .select('id, nome')
           .eq('id', user.id)
           .maybeSingle();
        
        if (dbErr || !atendente) {
          setAuthError(`Usuário reconhecido, mas perfil 'Atendente' não encontrado.`);
          return;
        }

        setPerfilAtual(atendente);
        setAuthError(null);
        await supabase.from('atendentes').update({ status: 'online' }).eq('id', atendente.id);
      } catch (err) {
        setAuthError("Erro ao carregar perfil.");
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

      const { data: rawData } = await supabase
        .from('conversas')
        .select(`
          *,
          clientes (nome, username),
          bots_config (nome_bot, atendente_id)
        `)
        .order('última_mensagem_at', { ascending: false });

      if (rawData) {
        const filtradas = (rawData as any[]).filter((c: any) => c.bots_config.atendente_id === user.id);
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

  // 3. Carregar dados gerenciais
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
          const count = (msgVolume as any[]).filter(m => new Date(m.created_at).getHours() === hour).length;
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

  // Carregar mensagens
  useEffect(() => {
    if (!conversaAtiva) return;

    async function fetchMensagens() {
      const { data } = await supabase
        .from('mensagens')
        .select('*')
        .eq('conversa_id', conversaAtiva!.id)
        .order('created_at', { ascending: true });

      if (data) setMensagens(data as Mensagem[]);
    }
    fetchMensagens();

    async function fetchMensagensInternas() {
      const { data } = await supabase
        .from('mensagens_internas')
        .select('*')
        .eq('conversa_id', conversaAtiva!.id)
        .order('created_at', { ascending: true });

      if (data) setMensagensInternas(data as MensagemInterna[]);
    }
    fetchMensagensInternas();

    const channel = supabase
      .channel(`mensagens:${conversaAtiva.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${conversaAtiva.id}` }, (p) => setMensagens((prev) => [...prev, p.new as Mensagem]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_internas', filter: `conversa_id=eq.${conversaAtiva.id}` }, (p) => setMensagensInternas((prev) => [...prev, p.new as MensagemInterna]))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversaAtiva]);

  const enviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !conversaAtiva) return;
    const msg = novaMensagem; setNovaMensagem('');
    try {
      const endpoint = modoMensagem === 'interno' ? '/api/messages/internal/send' : '/api/messages/send';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversaId: conversaAtiva.id, conteudo: msg, atendenteId: perfilAtual?.id }),
      });
    } catch (e) { console.error(e); setNovaMensagem(msg); }
  };

  const fecharAtendimento = async () => {
    if (!conversaAtiva || !confirm('Encerrar atendimento?')) return;
    await fetch('/api/conversas/fechar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversaId: conversaAtiva.id }),
    });
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
    } finally { setRefinandoIA(false); }
  };

  const mensagensUnificadas = [
    ...mensagens.map(m => ({ ...m, contexto: 'publico' as const })),
    ...mensagensInternas.map(m => ({ ...m, remetente: 'atendente' as const, contexto: 'interno' as const, sentimento: undefined }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const fazerLogout = async () => { if (confirm('Sair do sistema?')) await logout(); };

  return (
    <div className="flex h-screen w-full bg-[#0a0a0a] text-white overflow-hidden font-sans">
      
      {/* Sidebar - Fixa fora do context de Tabs */}
      <aside className="w-16 border-r border-white/5 flex flex-col items-center py-6 shrink-0 bg-[#0f0f0f]">
        <div className="flex-1 flex flex-col items-center gap-6 w-full">
          <div className="flex flex-col gap-4">
            <Button variant="ghost" onClick={() => setActiveTab('atendimento')} className={`h-11 w-11 rounded-xl p-0 transition-all ${activeTab === 'atendimento' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'}`}>
              <Bot className="w-6 h-6" />
            </Button>
            <Button variant="ghost" onClick={() => setActiveTab('gerencial')} className={`h-11 w-11 rounded-xl p-0 transition-all ${activeTab === 'gerencial' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'}`}>
              <Trophy className="w-6 h-6" />
            </Button>
            <Button variant="ghost" onClick={() => setActiveTab('configuracoes')} className={`h-11 w-11 rounded-xl p-0 transition-all ${activeTab === 'configuracoes' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-400 hover:text-white'}`}>
              <Settings className="w-6 h-6" />
            </Button>
          </div>
          <Separator className="w-8 opacity-10" />
        </div>
        <div className="mt-auto">
          <Button variant="ghost" onClick={fazerLogout} className="h-11 w-11 rounded-xl text-gray-500 hover:text-destructive transition-colors">
            <LogOut className="w-6 h-6" />
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full min-w-0 flex flex-col relative">
        <Tabs value={activeTab} className="h-full w-full flex flex-col m-0 p-0 border-none">
          
          {/* ABA ATENDIMENTO */}
          <TabsContent value="atendimento" className="flex-1 m-0 h-full p-0 flex flex-col overflow-hidden data-[state=inactive]:hidden border-none outline-none">
             <div className="flex h-full w-full overflow-hidden">
                {/* Lista de Conversas */}
                <div className="w-80 border-r border-white/5 flex flex-col bg-[#0f0f0f]/50">
                  <header className="p-5 border-b border-white/5 flex items-center gap-3">
                     <Avatar className="h-10 w-10 border border-white/10">
                        <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${perfilAtual?.nome || 'Admin'}`} />
                        <AvatarFallback className="bg-primary/20 font-bold">{perfilAtual?.nome?.charAt(0) || 'AT'}</AvatarFallback>
                     </Avatar>
                     <div className="overflow-hidden">
                        <h2 className="text-sm font-bold truncate tracking-tight">Painel SISTLG</h2>
                        <div className="text-[10px] flex items-center gap-1.5 mt-0.5">
                          {authError ? (
                            <span className="text-destructive font-bold flex items-center gap-1"><AlertCircle className="w-2.5 h-2.5" /> {authError}</span>
                          ) : (
                            <>
                              <span className={`w-2 h-2 rounded-full ${perfilAtual ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-yellow-500 animate-pulse'}`}></span>
                              <span className="text-gray-400 font-medium truncate max-w-[120px]">{perfilAtual?.nome || 'Identificando...'}</span>
                            </>
                          )}
                        </div>
                     </div>
                  </header>
                  <ScrollArea className="flex-1">
                     {conversas.map(conv => (
                       <div key={conv.id} onClick={() => setConversaAtiva(conv)} className={`p-4 border-b border-white/5 cursor-pointer transition-colors ${conversaAtiva?.id === conv.id ? 'bg-primary/10' : 'hover:bg-white/5'}`}>
                          <div className="flex items-center justify-between mb-1">
                             <h3 className="text-sm font-bold truncate">{conv.clientes.nome}</h3>
                             <span className="text-[10px] text-gray-500 italic">{conv.última_mensagem_at ? format(new Date(conv.última_mensagem_at), 'HH:mm') : ''}</span>
                          </div>
                          <Badge variant="secondary" className="bg-primary/20 text-primary text-[9px] border-none font-black px-1.5">{conv.bots_config.nome_bot}</Badge>
                       </div>
                     ))}
                  </ScrollArea>
                </div>

                {/* Área de Chat */}
                <div className="flex-1 flex flex-col bg-[#070707] h-full overflow-hidden">
                  {conversaAtiva ? (
                    <>
                      <header className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-md">
                         <div className="flex items-center gap-3">
                           <Avatar className="h-9 w-9 ring-1 ring-white/10"><AvatarFallback className="bg-white/5">{conversaAtiva.clientes.nome.charAt(0)}</AvatarFallback></Avatar>
                           <div>
                             <h4 className="text-sm font-bold leading-none">{conversaAtiva.clientes.nome}</h4>
                             <p className="text-[10px] text-gray-400 font-mono mt-1">@{conversaAtiva.clientes.username}</p>
                           </div>
                         </div>
                         <Button variant="outline" size="sm" onClick={fecharAtendimento} className="border-destructive/30 text-destructive h-8 px-4 text-xs font-bold rounded-lg hover:bg-destructive/10">FINALIZAR</Button>
                      </header>
                      <ScrollArea className="flex-1 p-6">
                         <div className="max-w-4xl mx-auto flex flex-col gap-5">
                            {mensagensUnificadas.map((msg, i) => (
                              <div key={msg.id || i} className={`flex ${msg.remetente !== 'cliente' ? 'justify-end' : 'justify-start'}`}>
                                 <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${msg.remetente !== 'cliente' ? (msg.contexto === 'interno' ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-200' : 'bg-primary text-white rounded-tr-none') : 'bg-white/5 border border-white/10 rounded-tl-none'}`}>
                                    {msg.contexto === 'interno' && <p className="text-[9px] font-black italic mb-1 uppercase text-yellow-500 flex items-center gap-1"><Users className="w-3 h-3" /> NOTA INTERNA</p>}
                                    {msg.remetente === 'bot' && <p className="text-[9px] font-black italic mb-1 uppercase text-blue-300 flex items-center gap-1"><Bot className="w-3 h-3" /> AUTO</p>}
                                    <p className="leading-relaxed">{msg.conteudo}</p>
                                    <div className="text-[9px] opacity-40 mt-1.5 flex justify-end font-mono uppercase">{format(new Date(msg.created_at), 'HH:mm')}</div>
                                 </div>
                              </div>
                            ))}
                         </div>
                      </ScrollArea>
                      <footer className={`p-4 border-t border-white/5 ${modoMensagem === 'interno' ? 'bg-yellow-500/5' : ''}`}>
                         <div className="flex gap-2 mb-3">
                           <Button size="sm" onClick={() => setModoMensagem('publico')} className={`h-7 px-3 text-[10px] font-bold rounded-full ${modoMensagem === 'publico' ? 'bg-primary' : 'bg-white/5'}`}>PÚBLICO</Button>
                           <Button size="sm" onClick={() => setModoMensagem('interno')} className={`h-7 px-3 text-[10px] font-bold rounded-full ${modoMensagem === 'interno' ? 'bg-yellow-600' : 'bg-white/5 text-yellow-500'}`}>INTERNO</Button>
                         </div>
                         <form onSubmit={enviarMensagem} className="flex gap-3">
                            <Input value={novaMensagem} onChange={e => setNovaMensagem(e.target.value)} placeholder="Type..." className="bg-white/5 border-none h-11 rounded-xl text-sm" />
                            <Button type="submit" size="icon" className="h-11 w-11 rounded-xl shadow-lg shadow-primary/20"><Send className="w-5 h-5" /></Button>
                         </form>
                      </footer>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                      <Bot className="w-16 h-16 opacity-5 mb-4" />
                      <p className="text-sm font-bold tracking-widest uppercase italic">Central SISTLG Telegram</p>
                    </div>
                  )}
                </div>
             </div>
          </TabsContent>

          {/* ABA GERENCIAL */}
          <TabsContent value="gerencial" className="flex-1 m-0 h-full p-10 overflow-auto bg-[#070707] data-[state=inactive]:hidden border-none outline-none">
             <div className="max-w-6xl mx-auto space-y-10">
                <header className="flex items-center justify-between pb-8 border-b border-white/10">
                   <div>
                     <h1 className="text-4xl font-black italic tracking-tighter uppercase">Insights</h1>
                     <p className="text-sm text-gray-500 font-medium">Performance e Gamificação em tempo real</p>
                   </div>
                   <Badge className="bg-primary/20 text-primary border-none px-4 py-1 font-black animate-pulse">LIVE DATA</Badge>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                   <Card className="bg-[#0f0f0f] border-white/5 p-6 hover:border-primary/30 transition-all">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Fluxo Total</p>
                      <div className="text-4xl font-black italic">{metrics.totalAtendimentos}</div>
                   </Card>
                   <Card className="bg-[#0f0f0f] border-white/5 p-6 border-transparent">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">CSAT Médio</p>
                      <div className="text-4xl font-black italic text-yellow-500">{metrics.csatMedio.toFixed(1)}</div>
                   </Card>
                   <Card className="bg-[#0f0f0f] border-white/5 p-6">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Atendentes On</p>
                      <div className="text-4xl font-black italic text-green-500">{atendentesRanking.filter(a => a.status === 'online').length}</div>
                   </Card>
                   <Card className="bg-primary border-none p-6 text-white shadow-xl shadow-primary/20">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-70">Conversão</p>
                      <div className="text-4xl font-black italic tracking-tighter">94%</div>
                   </Card>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-7 gap-8">
                   <Card className="lg:col-span-4 bg-[#0f0f0f] border-white/5 p-8 rounded-3xl min-h-[400px]">
                      <h3 className="text-xl font-black italic uppercase mb-8 flex items-center gap-3"><Trophy className="text-yellow-500" /> Top Operadores</h3>
                      <Table>
                        <TableHeader><TableRow className="border-white/10 hover:bg-transparent"><TableHead className="font-black text-xs uppercase text-gray-500">Pos</TableHead><TableHead className="font-black text-xs uppercase text-gray-500">Nome</TableHead><TableHead className="font-black text-xs uppercase text-gray-500 text-right">Score</TableHead></TableRow></TableHeader>
                        <TableBody>
                           {atendentesRanking.map((at, i) => (
                             <TableRow key={at.id} className="border-white/5 group">
                                <TableCell className={`font-black italic text-lg ${i === 0 ? 'text-yellow-500' : 'text-gray-500'}`}>{i+1}º</TableCell>
                                <TableCell className="font-bold">{at.nome}</TableCell>
                                <TableCell className="text-right font-black font-mono text-primary text-xl tracking-tighter">{at.pontos_gamificacao}</TableCell>
                             </TableRow>
                           ))}
                        </TableBody>
                      </Table>
                   </Card>
                   <Card className="lg:col-span-3 bg-[#0f0f0f] border-white/5 p-8 rounded-3xl min-h-[400px]">
                      <h3 className="text-xl font-black italic uppercase mb-8 flex items-center gap-3"><BarChart3 className="text-primary" /> Volume / Hora</h3>
                      <div className="h-[280px] w-full mt-4">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statsVolume}>
                               <XAxis dataKey="nome" axisLine={false} tickLine={false} fontSize={10} fontWeight="900" />
                               <CartesianGrid vertical={false} stroke="#ffffff05" />
                               <Bar dataKey="volume" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                   </Card>
                </div>
             </div>
          </TabsContent>

          {/* ABA CONFIGURAÇÕES */}
          <TabsContent value="configuracoes" className="flex-1 m-0 h-full p-10 overflow-auto bg-[#070707] data-[state=inactive]:hidden border-none outline-none">
             <div className="max-w-4xl mx-auto space-y-12">
                <header>
                   <h1 className="text-4xl font-black italic tracking-tighter uppercase">Settings</h1>
                   <p className="text-sm text-gray-500 font-medium">Controle de sistema e perfil</p>
                </header>
                <div className="grid gap-8">
                   <Card className="bg-[#0f0f0f] border-white/5 p-8 rounded-3xl">
                      <h3 className="text-lg font-black uppercase mb-6">Informações Pessoais</h3>
                      <div className="space-y-4">
                         <div className="space-y-2">
                           <label className="text-xs font-black uppercase text-gray-500">Nome de Exibição</label>
                           <Input defaultValue={perfilAtual?.nome} className="bg-white/5 border-none h-12 rounded-xl font-bold" />
                         </div>
                         <Button className="bg-primary/20 text-primary hover:bg-primary hover:text-white transition-all font-black px-10">SALVAR</Button>
                      </div>
                   </Card>
                </div>
             </div>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
