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
import { Send, MoreVertical, Search, Bot, User, Clock, Settings, Sparkles, XCircle, CheckCircle2, Trophy, BarChart3, TrendingUp, Star, Users, LogOut, AlertCircle, Menu, Zap, Eye, Tag, FileText } from 'lucide-react';
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
    id: string;
    nome: string;
    username: string;
  };
  bots_config: {
    id: string;
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
};

type RespostaRapida = {
  id: string;
  titulo: string;
  categoria: string;
  conteudo: string;
};

export default function Dashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState('atendimento');
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [conversaAtiva, setConversaAtiva] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [perfilAtual, setPerfilAtual] = useState<{ id: string, nome: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [atendentesRanking, setAtendentesRanking] = useState<any[]>([]);
  const [statsVolume, setStatsVolume] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({ totalAtendimentos: 0, csatMedio: 0 });
  const [modoMensagem, setModoMensagem] = useState<'publico' | 'interno'>('publico');
  const [mensagensInternas, setMensagensInternas] = useState<MensagemInterna[]>([]);
  const [apiKey, setApiKey] = useState('');
  
  const [respostasRapidas, setRespostasRapidas] = useState<RespostaRapida[]>([]);
  const [isCreatingResposta, setIsCreatingResposta] = useState(false);
  const [rTitulo, setRTitulo] = useState('');
  const [rCategoria, setRCategoria] = useState('');
  const [rConteudo, setRConteudo] = useState('');
  const [searchResposta, setSearchResposta] = useState('');

  // 1. Setup inicial e Auth
  useEffect(() => {
    async function setupDashboard() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setAuthError("Sessão não encontrada."); return; }

        const { data: atendente } = await supabase.from('atendentes').select('id, nome').eq('id', user.id).maybeSingle();
        if (!atendente) { setAuthError("Perfil não encontrado."); return; }

        setPerfilAtual(atendente);
        setAuthError(null);
        await supabase.from('atendentes').update({ status: 'online' }).eq('id', atendente.id);
        // Fetch Respostas Rápidas iniciais
        const { data: respoData } = await supabase.from('respostas_rapidas').select('*').eq('atendente_id', user.id).order('created_at', { ascending: false });
        if (respoData) setRespostasRapidas(respoData);

      } catch (err) { setAuthError("Erro de carregamento."); }
    }
    setupDashboard();
  }, []);

  // 2. Carregar Conversas
  useEffect(() => {
    async function loadConversas() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('conversas').select('*, clientes(id, nome, username), bots_config(id, nome_bot, atendente_id)').order('última_mensagem_at', { ascending: false });
      if (data) {
        const filt = (data as any[]).filter(c => c.bots_config.atendente_id === user.id);
        setConversas(filt);
        if (filt.length > 0 && !conversaAtiva) setConversaAtiva(filt[0]);
      }
    }
    loadConversas();
    const ch = supabase.channel('conversas').on('postgres_changes', { event: '*', schema: 'public', table: 'conversas' }, () => loadConversas()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversaAtiva]);

  // 3. Carregar Mensagens
  useEffect(() => {
    if (!conversaAtiva) return;
    async function fetchMsgs() {
      try {
        const res = await fetch(`/api/messages/history?clienteId=${conversaAtiva!.clientes.id}`);
        if (res.ok) {
          const json = await res.json();
          setMensagens(json.mensagens || []);
          setMensagensInternas(json.mensagensInternas || []);
        }
      } catch (err) {
        console.error('Erro buscando histórico unificado:', err);
      }
    }
    fetchMsgs();
    const ch = supabase.channel(`m:${conversaAtiva.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${conversaAtiva.id}` }, (p) => setMensagens(prev => [...prev, p.new as any]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_internas', filter: `conversa_id=eq.${conversaAtiva.id}` }, (p) => setMensagensInternas(prev => [...prev, p.new as any]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversaAtiva]);

  // 4. Carregar Dados Gerenciais (Light Version)
  useEffect(() => {
    if (activeTab !== 'gerencial') return;
    async function loadStats() {
      const { data: rank } = await supabase.from('atendentes').select('*').order('pontos_gamificacao', { ascending: false });
      if (rank) setAtendentesRanking(rank);
      const { count } = await supabase.from('conversas').select('*', { count: 'exact', head: true });
      setMetrics(prev => ({ ...prev, totalAtendimentos: count || 0 }));
      setStatsVolume([
        { nome: '08:00', volume: 15 }, { nome: '10:00', volume: 42 }, { nome: '12:00', volume: 38 },
        { nome: '14:00', volume: 65 }, { nome: '16:00', volume: 82 }, { nome: '18:00', volume: 48 }
      ]);
    }
    loadStats();
  }, [activeTab]);

  const enviarMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMensagem.trim() || !conversaAtiva) return;
    const txt = novaMensagem; setNovaMensagem('');
    const ep = modoMensagem === 'interno' ? '/api/messages/internal/send' : '/api/messages/send';
    await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversaId: conversaAtiva.id, conteudo: txt, atendenteId: perfilAtual?.id }) });
  };

  const salvarConfiguracaoIA = async () => {
    if (!apiKey) return alert("Por favor, preencha a chave.");
    const myBotIds = Array.from(new Set(conversas.map(c => c.bots_config?.id).filter(Boolean)));
    if (myBotIds.length === 0) return alert("Nenhum bot associado encontrado para aplicar esta chave.");
    
    try {
      for (const botId of myBotIds) {
        await fetch('/api/admin/bot-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botId, openai_api_key: apiKey })
        });
      }
      alert('Chave OpenAI salva com sucesso no banco de dados!');
      setApiKey('');
    } catch (err) {
      alert("Erro ao salvar chave da OpenAI.");
    }
  };

  const [tagsMenuOpen, setTagsMenuOpen] = useState(false);
  const tagsList = ['#nome', '#primeiroNome', '#saudação'];

  const aplicarRespostaRapida = (conteudoRaw: string) => {
    if (!conversaAtiva) return;
    let mensagemProcessada = conteudoRaw;
    const primeiroNome = conversaAtiva.clientes.nome.split(' ')[0] || '';
    
    mensagemProcessada = mensagemProcessada.replace(/#nome/g, conversaAtiva.clientes.nome);
    mensagemProcessada = mensagemProcessada.replace(/#primeiroNome/g, primeiroNome);
    
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    mensagemProcessada = mensagemProcessada.replace(/#saudação/g, saudacao);
    
    setNovaMensagem(prev => prev + (prev ? ' ' : '') + mensagemProcessada);
    setActiveTab('atendimento');
  };

  const salvarNovaResposta = async () => {
    if(!rTitulo || !rConteudo) return alert("Título e Conteúdo são obrigatórios");
    try {
      const res = await fetch('/api/respostas-rapidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: rTitulo, categoria: rCategoria, conteudo: rConteudo })
      });
      const data = await res.json();
      if(data.success) {
         setRespostasRapidas([data.resposta, ...respostasRapidas]);
         setIsCreatingResposta(false);
         setRTitulo('');
         setRCategoria('');
         setRConteudo('');
      } else { alert("Erro ao criar resposta: " + data.error); }
    } catch(err) {
      console.error(err);
      alert("Erro fatal ao salvar resposta rápida");
    }
  };

  const msgsUnificadas = [
    ...mensagens.map(m => ({ ...m, ctx: 'pub' })),
    ...mensagensInternas.map(m => ({ ...m, remetente: 'atendente', ctx: 'int' }))
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <div className="flex h-screen w-full bg-[#F0F2F5] text-[#333] overflow-hidden font-sans">
      
      {/* Sidebar - Estilo Telegram Web */}
      <aside className="w-[72px] bg-white border-r border-[#E5E7EB] flex flex-col items-center py-6 shrink-0 shadow-sm z-20">
        <div className="flex-1 flex flex-col items-center gap-6 w-full">
          <Button variant="ghost" className="text-[#707579] hover:bg-[#F4F4F5] h-12 w-12 rounded-full p-0">
            <Menu className="w-6 h-6" />
          </Button>
          <div className="flex flex-col gap-5 mt-4">
            <Button variant="ghost" onClick={() => setActiveTab('atendimento')} className={`h-12 w-12 rounded-2xl p-0 transition-all ${activeTab === 'atendimento' ? 'bg-[#3390EC] text-white shadow-lg shadow-[#3390EC]/30' : 'text-[#707579] hover:bg-[#F4F4F5]'}`}>
              <Bot className="w-6 h-6" />
            </Button>
            <Button variant="ghost" onClick={() => setActiveTab('respostas_rapidas')} className={`h-12 w-12 rounded-2xl p-0 transition-all ${activeTab === 'respostas_rapidas' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'text-[#707579] hover:bg-[#F4F4F5]'}`}>
              <Zap className="w-6 h-6" />
            </Button>
            <Button variant="ghost" onClick={() => setActiveTab('gerencial')} className={`h-12 w-12 rounded-2xl p-0 transition-all ${activeTab === 'gerencial' ? 'bg-[#3390EC] text-white shadow-lg shadow-[#3390EC]/30' : 'text-[#707579] hover:bg-[#F4F4F5]'}`}>
              <Trophy className="w-6 h-6" />
            </Button>
            <Button variant="ghost" onClick={() => setActiveTab('configuracoes')} className={`h-12 w-12 rounded-2xl p-0 transition-all ${activeTab === 'configuracoes' ? 'bg-[#3390EC] text-white shadow-lg shadow-[#3390EC]/30' : 'text-[#707579] hover:bg-[#F4F4F5]'}`}>
              <Settings className="w-6 h-6" />
            </Button>
          </div>
        </div>
        <div className="mt-auto">
          <Button variant="ghost" onClick={async () => await logout()} className="h-12 w-12 rounded-full text-[#707579] hover:text-red-500 hover:bg-red-50">
            <LogOut className="w-6 h-6" />
          </Button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden">
        <Tabs value={activeTab} className="h-full w-full flex flex-row m-0 p-0 border-none bg-white">
          
          {/* TAB: ATENDIMENTO (TELEGRAM CLONE) */}
          <TabsContent value="atendimento" className="flex-1 m-0 h-full p-0 flex flex-row overflow-hidden data-[state=inactive]:hidden border-none outline-none">
            
            {/* List Section */}
            <div className="w-[380px] border-r border-[#E5E7EB] flex flex-col bg-white shrink-0">
              <div className="p-4 flex flex-col gap-4">
                <div className="relative group">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A0A5AA]" />
                  <Input placeholder="Search" className="pl-10 h-10 bg-[#F4F4F5] border-none rounded-2xl text-sm focus-visible:ring-1 focus-visible:ring-[#3390EC]" />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {conversas.length > 0 ? conversas.map(c => (
                  <div key={c.id} onClick={() => setConversaAtiva(c)} className={`px-4 py-3 flex items-center gap-4 cursor-pointer transition-colors border-b border-gray-50 ${conversaAtiva?.id === c.id ? 'bg-[#3390EC] text-white' : 'hover:bg-[#F4F4F5]'}`}>
                    <Avatar className="h-14 w-14 border-none shadow-sm">
                      <AvatarFallback className={`${conversaAtiva?.id === c.id ? 'bg-white/20 text-white' : 'bg-[#3390EC]/10 text-[#3390EC]'} font-bold text-xl uppercase`}>{c.clientes.nome.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-[15px] truncate tracking-tight">{c.clientes.nome}</h4>
                        <span className={`text-[11px] ${conversaAtiva?.id === c.id ? 'text-white/70' : 'text-[#707579]'}`}>
                          {c.última_mensagem_at ? format(new Date(c.última_mensagem_at), 'HH:mm') : ''}
                        </span>
                      </div>
                      <p className={`text-[13px] truncate mt-0.5 ${conversaAtiva?.id === c.id ? 'text-white/80' : 'text-[#707579]'}`}>@{c.clientes.username}</p>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-gray-400 text-sm italic">Nenhum atendimento ativo</div>
                )}
              </ScrollArea>
            </div>

            {/* Chat Section */}
            <div className="flex-1 flex flex-col bg-[#E7EBF0] relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://telegram.org/img/t_wallpaper.png')] opacity-[0.04] pointer-events-none"></div>

              {conversaAtiva ? (
                <>
                  <header className="h-[60px] bg-white border-b border-[#E5E7EB] flex items-center justify-between px-6 z-10 shrink-0">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10"><AvatarFallback className="bg-[#3390EC] text-white font-bold">{conversaAtiva.clientes.nome.charAt(0)}</AvatarFallback></Avatar>
                      <div className="flex flex-col">
                         <h3 className="text-[15px] font-bold text-[#333] leading-tight">{conversaAtiva.clientes.nome}</h3>
                         <span className="text-[12px] text-green-500 font-medium">online</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-blue-50 text-[#3390EC] border-none font-bold px-3">{conversaAtiva.bots_config.nome_bot.toUpperCase()}</Badge>
                      <Button variant="ghost" className="text-[#707579] hover:bg-gray-100 rounded-full h-10 w-10 p-0"><MoreVertical className="w-5 h-5" /></Button>
                    </div>
                  </header>

                  <ScrollArea className="flex-1 pt-6 px-4 md:px-20 lg:px-40 z-10">
                    <div className="flex flex-col gap-3 pb-8">
                      {msgsUnificadas.map((m: any, i) => {
                        const isAssistant = m.remetente !== 'cliente';
                        return (
                          <div key={m.id || i} className={`flex ${isAssistant ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] px-4 py-2 rounded-2xl shadow-sm text-[14px] relative ${isAssistant ? 'bg-[#EEFFDE] text-[#000] rounded-tr-none' : 'bg-white text-[#000] rounded-tl-none'}`}>
                              {m.ctx === 'int' && <p className="text-[10px] font-black text-orange-600 mb-1 uppercase tracking-tighter">Nota Interna</p>}
                              <p className="leading-normal">{m.conteudo}</p>
                              <div className="text-[10px] text-gray-400 mt-1 flex justify-end gap-1.5 font-medium uppercase">
                                {format(new Date(m.created_at), 'HH:mm')}
                                {isAssistant && <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <footer className="p-4 md:px-20 lg:px-40 bg-transparent z-10 shrink-0">
                    <div className="flex gap-2 mb-2 ml-2">
                       <Button size="sm" onClick={() => setModoMensagem('publico')} className={`h-6 px-3 text-[10px] font-bold rounded-full border-none ${modoMensagem === 'publico' ? 'bg-[#3390EC] text-white' : 'bg-white text-gray-400'}`}>PÚBLICO</Button>
                       <Button size="sm" onClick={() => setModoMensagem('interno')} className={`h-6 px-3 text-[10px] font-bold rounded-full border-none ${modoMensagem === 'interno' ? 'bg-orange-500 text-white' : 'bg-white text-orange-400'}`}>INTERNO</Button>
                    </div>
                    <form onSubmit={enviarMsg} className="flex gap-3 items-center bg-white rounded-2xl px-4 py-2.5 shadow-md border border-[#E5E7EB]">
                      <Button type="button" variant="ghost" className="text-[#707579] p-0 h-10 w-10 rounded-full hover:bg-gray-50 shrink-0"><MoreVertical className="w-6 h-6" /></Button>
                      <Input value={novaMensagem} onChange={e => setNovaMensagem(e.target.value)} placeholder="Message" className="flex-1 border-none bg-transparent shadow-none text-[15px] placeholder:text-[#A0A5AA] h-auto p-0" />
                      <Button type="submit" variant="ghost" className="text-[#3390EC] p-0 h-10 w-10 rounded-full hover:bg-blue-50 shrink-0">
                        <Send className="w-6 h-6" />
                      </Button>
                    </form>
                  </footer>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-white/40">
                  <div className="bg-black/5 p-6 rounded-full mb-6 animate-pulse"><Bot className="w-12 h-12 opacity-20" /></div>
                  <p className="text-sm font-bold tracking-tight bg-[#707579] text-white px-4 py-1.5 rounded-full opacity-60">Selecione uma conversa para começar</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB: RESPOSTAS RÁPIDAS */}
          <TabsContent value="respostas_rapidas" className="flex-1 m-0 h-full bg-[#f8f9fa] overflow-hidden data-[state=inactive]:hidden border-none outline-none">
            <div className="max-w-2xl mx-auto flex flex-col h-full bg-white shadow-xl shadow-black/5 animate-in slide-in-from-left-8 duration-300">
              
              <header className="h-[70px] border-b border-gray-100 flex items-center justify-between px-6 shrink-0 bg-white z-10 relative">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                     <Zap className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-[#333] tracking-tight">{isCreatingResposta ? 'Criar Resposta Rápida' : 'Respostas Rápidas'}</h2>
                    {isCreatingResposta && <p className="text-xs text-gray-400 font-medium tracking-tight">Configure sua automação.</p>}
                  </div>
                </div>
                {isCreatingResposta ? (
                   <Button variant="ghost" onClick={() => setIsCreatingResposta(false)} className="text-gray-400 hover:bg-gray-50 h-10 w-10 p-0 rounded-full">
                     <XCircle className="w-6 h-6" />
                   </Button>
                ) : (
                   <Button onClick={() => setIsCreatingResposta(true)} className="bg-green-500 hover:bg-green-600 text-white font-bold h-10 px-5 rounded-full shadow-lg shadow-green-500/20">
                     + Novo
                   </Button>
                )}
              </header>

              <ScrollArea className="flex-1 p-6">
                {!isCreatingResposta ? (
                  <div className="space-y-6">
                    {/* Pesquisa e Filtros */}
                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
                        <Input value={searchResposta} onChange={e => setSearchResposta(e.target.value)} placeholder="Pesquisar resposta rápida" className="pl-11 h-12 bg-gray-50 border-gray-100 rounded-2xl focus-visible:ring-green-500 shadow-inner" />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Badge className="bg-green-600 hover:bg-green-700 text-white cursor-pointer px-4 py-1.5 rounded-full font-bold">Tudo</Badge>
                        <Badge className="bg-green-100 hover:bg-green-200 text-green-800 border-none cursor-pointer px-4 py-1.5 rounded-full font-bold">Por Tipo</Badge>
                        <Badge className="bg-green-100 hover:bg-green-200 text-green-800 border-none cursor-pointer px-4 py-1.5 rounded-full font-bold">Sem Categoria</Badge>
                      </div>
                    </div>

                    <Separator className="bg-gray-100" />

                    {/* Lista Agrupada - Mock Sem Categoria */}
                    <div className="space-y-3">
                       <h3 className="text-xs font-black text-green-600 tracking-wider uppercase ml-1 flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5" /> Suas Respostas Rápidas
                       </h3>
                       <div className="flex flex-col rounded-3xl bg-[#EEFFDE] border border-green-200 overflow-hidden shadow-sm">
                         {respostasRapidas.filter(r => r.titulo.toLowerCase().includes(searchResposta.toLowerCase())).map((resp, i) => (
                           <div key={resp.id} className={`flex items-center justify-between p-4 bg-[#EEFFDE] hover:bg-green-100 transition-colors ${i !== 0 ? 'border-t border-green-200' : ''}`}>
                             <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-green-700 opacity-60" />
                                <span className="font-bold text-green-900 text-sm">{resp.titulo}</span>
                             </div>
                             <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-700 hover:bg-green-200 rounded-full" title="Ver Resposta">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button onClick={() => aplicarRespostaRapida(resp.conteudo)} variant="ghost" size="icon" className="h-8 w-8 text-green-700 hover:bg-green-200 rounded-full" title="Usar no Chat">
                                  <Send className="w-4 h-4" />
                                </Button>
                             </div>
                           </div>
                         ))}
                         {respostasRapidas.length === 0 && (
                           <div className="p-6 text-center text-green-800/60 text-sm font-medium">Nenhuma resposta encontrada.</div>
                         )}
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="space-y-2">
                       <label className="text-xs font-black text-gray-500 uppercase tracking-widest pl-2">Título do Modelo</label>
                       <Input value={rTitulo} onChange={e => setRTitulo(e.target.value)} placeholder="Digite o título da resposta rápida" className="h-14 bg-gray-50 border-gray-200 rounded-2xl shadow-inner font-bold text-gray-700 px-4" />
                    </div>

                    <Card className="border-gray-200 shadow-sm rounded-3xl overflow-hidden bg-white">
                      <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center relative">
                        <h4 className="font-black text-[#333]">Ação da Resposta Rápida</h4>
                        <div className="relative">
                          <Button onClick={() => setTagsMenuOpen(!tagsMenuOpen)} size="sm" className="bg-green-500 hover:bg-green-600 text-white rounded-full font-bold h-8 px-4 text-xs gap-1 shadow-md shadow-green-500/20">
                            # Tags <Zap className="w-3 h-3 fill-current" />
                          </Button>
                          {tagsMenuOpen && (
                            <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-2xl shadow-2xl bg-white border border-gray-100 z-50 p-2 animate-in fade-in zoom-in-95">
                               <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2 ml-1 mt-1">Tags Disponíveis</p>
                               {tagsList.map(tag => (
                                 <button key={tag} onClick={() => { setRConteudo(prev => prev + ' ' + tag + ' '); setTagsMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm font-bold text-gray-700 hover:bg-green-50 hover:text-green-600 rounded-xl transition-colors">
                                   {tag}
                                 </button>
                               ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="p-5 flex flex-col gap-4">
                        <textarea value={rConteudo} onChange={e => setRConteudo(e.target.value)} placeholder="Digite o conteúdo da resposta. Use as #Tags acima para dados dinâmicos do cliente..." className="w-full h-32 bg-gray-50 rounded-2xl border-none resize-none p-4 text-sm font-medium focus:ring-2 outline-none focus:ring-green-500 shadow-inner" />
                        <Button onClick={salvarNovaResposta} className="w-full h-12 bg-green-500 hover:bg-green-600 text-white font-black uppercase tracking-wide rounded-2xl shadow-xl shadow-green-500/20 text-sm">
                          Salvar Resposta Rápida
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}
              </ScrollArea>

            </div>
          </TabsContent>

          {/* TAB: GERENCIAL (LIGHT VERSION) */}
          <TabsContent value="gerencial" className="flex-1 m-0 h-full p-10 bg-[#F4F4F5] overflow-auto data-[state=inactive]:hidden border-none outline-none">
             <div className="max-w-6xl mx-auto space-y-10">
                <header>
                   <h1 className="text-3xl font-black text-[#333] tracking-tighter uppercase italic">Insights</h1>
                   <p className="text-sm text-gray-500 font-medium">Dashboard de Performance SISTLG</p>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                   <Card className="p-8 border-none bg-white shadow-sm rounded-3xl">
                      <p className="text-[11px] font-black text-[#707579] uppercase tracking-widest mb-2">Total Fluxo</p>
                      <div className="text-4xl font-black text-[#3390EC] italic">{metrics.totalAtendimentos}</div>
                   </Card>
                   <Card className="p-8 border-none bg-white shadow-sm rounded-3xl">
                      <p className="text-[11px] font-black text-[#707579] uppercase tracking-widest mb-2">CSAT Médio</p>
                      <div className="text-4xl font-black text-yellow-500 italic">4.9</div>
                   </Card>
                   <Card className="p-8 border-none bg-[#EEFFDE] shadow-sm rounded-3xl">
                      <p className="text-[11px] font-black text-green-700 uppercase tracking-widest mb-2">Em Aberto</p>
                      <div className="text-4xl font-black text-green-700 italic">{conversas.length}</div>
                   </Card>
                   <Card className="p-8 border-none bg-[#3390EC] shadow-xl shadow-[#3390EC]/30 rounded-3xl text-white">
                      <p className="text-[11px] font-black uppercase tracking-widest mb-2 opacity-70">SLA Médio</p>
                      <div className="text-4xl font-black italic">2 min</div>
                   </Card>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   <Card className="p-8 border-none bg-white shadow-sm rounded-3xl">
                      <h3 className="font-black text-lg uppercase italic mb-8 flex items-center gap-2"><Trophy className="text-yellow-500 h-6 w-6" /> Placar de Líderes</h3>
                      <Table>
                        <TableHeader><TableRow className="border-gray-100 hover:bg-transparent"><TableHead className="font-black text-[10px] uppercase">Operador</TableHead><TableHead className="text-right font-black text-[10px] uppercase">Pontos</TableHead></TableRow></TableHeader>
                        <TableBody>
                           {atendentesRanking.map((a, i) => (
                             <TableRow key={a.id} className="border-gray-50 group hover:bg-gray-50">
                                <TableCell className="flex items-center gap-3">
                                   <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black italic text-sm ${i === 0 ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'}`}>{i+1}</div>
                                   <span className="font-bold text-[#333]">{a.nome}</span>
                                </TableCell>
                                <TableCell className="text-right font-black text-[#3390EC] text-xl italic tracking-tighter">{a.pontos_gamificacao}</TableCell>
                             </TableRow>
                           ))}
                        </TableBody>
                      </Table>
                   </Card>
                   <Card className="p-8 border-none bg-white shadow-sm rounded-3xl">
                      <h3 className="font-black text-lg uppercase italic mb-8 flex items-center gap-3"><BarChart3 className="text-[#3390EC] h-6 w-6" /> Volume por Hora</h3>
                      <div className="h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={statsVolume}>
                            <XAxis dataKey="nome" axisLine={false} tickLine={false} fontSize={10} fontWeight="800" />
                            <Bar dataKey="volume" fill="#3390EC" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                   </Card>
                </div>
             </div>
          </TabsContent>

          {/* TAB: CONFIGURATIONS (LIGHT VERSION) */}
          <TabsContent value="configuracoes" className="flex-1 m-0 h-full p-10 bg-[#F4F4F5] overflow-auto data-[state=inactive]:hidden border-none outline-none">
             <div className="max-w-2xl mx-auto space-y-6">
                <Card className="p-10 bg-white border-none shadow-sm rounded-[40px]">
                   <div className="flex flex-col items-center mb-10 text-center">
                      <div className="w-24 h-24 bg-[#3390EC]/10 text-[#3390EC] rounded-[30px] flex items-center justify-center mb-6 shadow-inner rotate-3 hover:rotate-0 transition-transform cursor-pointer">
                         <Bot className="w-12 h-12" />
                      </div>
                      <h2 className="text-3xl font-black text-[#333] tracking-tighter uppercase italic">Centro de IA</h2>
                      <p className="text-sm text-[#707579] font-medium mt-1">Configure o cérebro autônomo do SISTLG</p>
                   </div>
                   
                   <div className="space-y-10">
                      <div className="space-y-4">
                         <div className="flex items-center justify-between ml-1">
                            <label className="text-[12px] font-black text-[#707579] uppercase tracking-widest">OpenAI API Key</label>
                            <Badge className="bg-blue-100 text-[#3390EC] border-none text-[10px] font-bold">GPT-4O MINI</Badge>
                         </div>
                         <div className="flex gap-3">
                            <Input 
                              type="password" 
                              value={apiKey} 
                              onChange={e => setApiKey(e.target.value)}
                              placeholder="sk-...." 
                              className="h-14 bg-[#F4F4F5] border-none rounded-2xl font-mono text-sm px-6" 
                            />
                            <Button onClick={salvarConfiguracaoIA} className="h-14 px-8 bg-[#3390EC] hover:bg-[#2879C9] font-black rounded-2xl shadow-xl shadow-[#3390EC]/30 uppercase italic">Salvar</Button>
                         </div>
                         <div className="flex items-center gap-2 p-4 bg-orange-50 rounded-2xl border border-orange-100/50">
                            <AlertCircle className="w-4 h-4 text-orange-500" />
                            <p className="text-[11px] text-orange-700 font-medium leading-tight">Sua chave é armazenada de forma criptografada e usada apenas para processar mensagens do bot.</p>
                         </div>
                      </div>

                      <Separator className="opacity-10" />

                      <div className="grid grid-cols-2 gap-4">
                         <div className="p-6 bg-[#EEFFDE] rounded-3xl border border-green-200/50">
                            <CheckCircle2 className="text-green-600 w-6 h-6 mb-3" />
                            <h4 className="text-sm font-black text-green-900 uppercase">Status do Bot</h4>
                            <p className="text-[11px] text-green-700 font-bold mt-1 uppercase italic">Ativo & Operacional</p>
                         </div>
                         <div className="p-6 bg-blue-50 rounded-3xl border border-blue-200/50">
                            <Sparkles className="text-[#3390EC] w-6 h-6 mb-3" />
                            <h4 className="text-sm font-black text-[#3390EC] uppercase">Inteligência</h4>
                            <p className="text-[11px] text-blue-800 font-bold mt-1 uppercase italic">Pronto para Responder</p>
                         </div>
                      </div>
                   </div>
                </Card>
             </div>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
