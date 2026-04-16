import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isOperational } from '@/lib/hours';
import { sendTelegramMessage } from '@/lib/telegram';
import { generateEmbedding, analyzeSentiment, generateAIResponse } from '@/lib/openai';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bot_id: string }> }
) {
  try {
    const { bot_id } = await params;
    const body = await request.json();

    // 1. Buscar configuração do bot no banco
    const { data: botConfig, error: botError } = await supabaseAdmin
      .from('bots_config')
      .select('*, atendentes(*)')
      .eq('id', bot_id)
      .single();

    if (botError || !botConfig) {
      console.error('Bot não encontrado ou erro:', botError);
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // 2. Tratar Callbacks (Pesquisa de Satisfação - CSAT)
    if (body.callback_query) {
      const callback = body.callback_query;
      const data = callback.data; 

      if (data && data.startsWith('csat:')) {
        const [, notaStr, conversaId] = data.split(':');
        const nota = parseInt(notaStr);

        const { data: conv } = await supabaseAdmin
          .from('conversas')
          .select('id, bot_id, bots_config(atendente_id)')
          .eq('id', conversaId)
          .single();

        if (conv) {
          const atendenteId = (conv.bots_config as any).atendente_id;
          await supabaseAdmin.from('pesquisas_satisfacao').insert({
            conversa_id: conversaId,
            atendente_id: atendenteId,
            nota: nota,
            mes_referencia: new Date().toISOString().slice(0, 7),
          });
          await supabaseAdmin.rpc('increment_atendente_points', { atendente_row_id: atendenteId, pontos: nota * 10 });
          await fetch(`https://api.telegram.org/bot${botConfig.token_telegram}/answerCallbackQuery`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ callback_query_id: callback.id, text: `Nota: ${nota} 🌟` }),
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // 3. Extrair dados da mensagem comum
    const message = body.message || body.edited_message;
    if (!message) return NextResponse.json({ ok: true }); 

    const chatId = message.chat.id;
    const from = message.from;
    const text = message.text || '';

    // 4. Registrar/Atualizar Cliente
    const { data: cliente, error: clientError } = await supabaseAdmin
      .from('clientes')
      .upsert({
        telegram_id: from.id,
        nome: `${from.first_name} ${from.last_name || ''}`.trim(),
        username: from.username,
      }, { onConflict: 'telegram_id' })
      .select()
      .single();

    if (clientError) throw clientError;

    // 5. Fluxo LGPD (Primeiro Contato)
    if (!cliente.consentimento_lgpd) {
      const msgLGPD = "<b>Termos de Uso e Privacidade</b> 🛡️\n\n" +
                      "Olá! Ao continuar este atendimento, você concorda com o tratamento dos seus dados para fins de suporte, conforme a LGPD.";
      await sendTelegramMessage(botConfig.token_telegram, chatId, msgLGPD);
      await supabaseAdmin.from('clientes').update({ consentimento_lgpd: true, data_consentimento: new Date().toISOString() }).eq('id', cliente.id);
    }

    // 6. Buscar ou Criar Conversa (Sessão)
    let { data: conversa } = await supabaseAdmin
      .from('conversas')
      .select('*')
      .eq('cliente_id', cliente.id)
      .eq('bot_id', botConfig.id)
      .eq('status', 'aberto')
      .single();

    if (!conversa) {
      const { data: newConv } = await supabaseAdmin.from('conversas').insert({ cliente_id: cliente.id, bot_id: botConfig.id, status: 'aberto' }).select().single();
      conversa = newConv;
    }

    // 7. IA: Análise de Sentimento
    let sentimento: 'positivo' | 'negativo' | 'neutro' = 'neutro';
    if (text.length > 0) {
      try {
        sentimento = await analyzeSentiment(text, botConfig.openai_api_key);
      } catch (err) { console.error('Erro IA:', err); }
    }

    // 8. Salvar Mensagem no Banco
    const { error: msgError } = await supabaseAdmin
      .from('mensagens')
      .insert({
        conversa_id: conversa.id,
        remetente: 'cliente',
        tipo: 'texto',
        conteudo: text,
        sentimento: sentimento,
      });

    if (msgError) throw msgError;

    // 9. Verificar Horário de Atendimento
    if (!isOperational()) {
      const msgFechado = "Olá! No momento estamos fora do nosso horário de atendimento.\n\n" +
                         "Seg-Sex: 08:00 às 23:00\nSáb-Dom: 18:00 às 23:00";
      await sendTelegramMessage(botConfig.token_telegram, chatId, msgFechado);
      return NextResponse.json({ ok: true, status: 'closed' });
    }

    // 10. Resposta Inteligente IA (Se Ativada)
    if (botConfig.is_active && text.length > 0) {
      try {
        const aiResponse = await generateAIResponse([{ role: 'user', content: text }], botConfig.nome_bot, botConfig.openai_api_key);
        if (aiResponse) {
          await sendTelegramMessage(botConfig.token_telegram, chatId, aiResponse);
          await supabaseAdmin.from('mensagens').insert({
            conversa_id: conversa.id,
            remetente: 'bot',
            tipo: 'texto',
            conteudo: aiResponse,
          });
        }
      } catch (err) { console.error('Erro Resposta IA:', err); }
    }

    return NextResponse.json({ ok: true, status: 'received' });

  } catch (error: any) {
    console.error('Erro no Webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
