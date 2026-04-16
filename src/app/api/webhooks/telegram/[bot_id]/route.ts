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

        // Buscar dados da conversa para saber quem foi o atendente
        const { data: conv, error: convErr } = await supabaseAdmin
          .from('conversas')
          .select('id, bot_id, bots_config(atendente_id)')
          .eq('id', conversaId)
          .single();

        if (conv && !convErr) {
          const atendenteId = (conv.bots_config as any).atendente_id;

          // 1. Salvar a pesquisa
          await supabaseAdmin.from('pesquisas_satisfacao').insert({
            conversa_id: conversaId,
            atendente_id: atendenteId,
            nota: nota,
            mes_referencia: new Date().toISOString().slice(0, 7),
          });

          // 2. Gamificação: Adicionar pontos ao atendente (Nota * 10)
          const pontosGanhos = nota * 10;
          await supabaseAdmin.rpc('increment_atendente_points', { 
            atendente_row_id: atendenteId, 
            pontos: pontosGanhos 
          });

          // 3. Responder ao Telegram
          await fetch(`https://api.telegram.org/bot${botConfig.token_telegram}/answerCallbackQuery`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ callback_query_id: callback.id, text: `Obrigado! Nota: ${nota} 🌟` }),
          });

          // 4. Editar mensagem original
          await fetch(`https://api.telegram.org/bot${botConfig.token_telegram}/editMessageText`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               chat_id: callback.message.chat.id,
               message_id: callback.message.message_id,
               text: `Pesquisa Concluída: <b>${nota} estrelas</b>. Obrigado!`,
               parse_mode: 'HTML',
             }),
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

    // 3. Registrar/Atualizar Cliente
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

    // 4. Fluxo LGPD (Primeiro Contato)
    if (!cliente.consentimento_lgpd) {
      const msgLGPD = "<b>Termos de Uso e Privacidade</b> 🛡️\n\n" +
                      "Olá! Ao continuar este atendimento, você concorda com o tratamento dos seus dados para fins de suporte, conforme a LGPD.\n\n" +
                      "Para ler nossos termos completos, acesse: <i>[LINK_DOS_TERMOS]</i>";
      
      await sendTelegramMessage(botConfig.token_telegram, chatId, msgLGPD);
      
      // Atualizar consentimento
      await supabaseAdmin
        .from('clientes')
        .update({ consentimento_lgpd: true, data_consentimento: new Date().toISOString() })
        .eq('id', cliente.id);
    }

    // 5. Buscar ou Criar Conversa (Sessão)
    let { data: conversa, error: convError } = await supabaseAdmin
      .from('conversas')
      .select('*')
      .eq('cliente_id', cliente.id)
      .eq('bot_id', botConfig.id)
      .eq('status', 'aberto')
      .single();

    if (!conversa) {
      const { data: newConv, error: newConvErr } = await supabaseAdmin
        .from('conversas')
        .insert({
          cliente_id: cliente.id,
          bot_id: botConfig.id,
          status: 'aberto',
        })
        .select()
        .single();
      
      if (newConvErr) throw newConvErr;
      conversa = newConv;
    }

    // 5. IA: Gerar Embedding e Analisar Sentimento
    let embedding = null;
    let sentimento: 'positivo' | 'negativo' | 'neutro' = 'neutro';

    if (text.length > 0) {
      try {
        // Rodar em paralelo para performance
        const [embResult, sentResult] = await Promise.all([
          generateEmbedding(text),
          analyzeSentiment(text)
        ]);
        embedding = embResult;
        sentimento = sentResult;
      } catch (err) {
        console.error('Erro ao processar IA:', err);
      }
    }

    // 6. Salvar Mensagem no Banco
    const { error: msgError } = await supabaseAdmin
      .from('mensagens')
      .insert({
        conversa_id: conversa.id,
        remetente: 'cliente',
        tipo: 'texto',
        conteudo: text,
        embedding: embedding,
        sentimento: sentimento,
      });

    if (msgError) throw msgError;

    // 7. Verificar Horário de Atendimento
      await sendTelegramMessage(botConfig.token_telegram, chatId, msgFechado);
      
      return NextResponse.json({ ok: true, status: 'closed' });
    }

    // 8. Resposta Inteligente IA (Autônomo)
    if (botConfig.is_active && text.length > 0) {
      try {
        // Gerar resposta com base no contexto
        const aiResponse = await generateAIResponse([
          { role: 'user', content: text }
        ], botConfig.nome_bot);

        if (aiResponse) {
          // 1. Enviar para o Telegram
          await sendTelegramMessage(botConfig.token_telegram, chatId, aiResponse);

          // 2. Salvar no banco
          await supabaseAdmin.from('mensagens').insert({
            conversa_id: conversa.id,
            remetente: 'bot',
            tipo: 'texto',
            conteudo: aiResponse,
          });
        }
      } catch (err) {
        console.error('Erro no fluxo autônomo da IA:', err);
      }
    }

    return NextResponse.json({ ok: true, status: 'received' });

  } catch (error: any) {
    console.error('Erro no Webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
