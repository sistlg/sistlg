import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const { conversaId } = await request.json();

    if (!conversaId) {
      return NextResponse.json({ error: 'ID da conversa é obrigatório' }, { status: 400 });
    }

    // 1. Buscar a conversa para obter dados do cliente e do bot
    const { data: conversa, error: convError } = await supabaseAdmin
      .from('conversas')
      .select(`
        *,
        clientes (telegram_id, nome),
        bots_config (token_telegram)
      `)
      .eq('id', conversaId)
      .single();

    if (convError || !conversa) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    // 2. Marcar como fechado no banco
    const { error: updateError } = await supabaseAdmin
      .from('conversas')
      .update({ status: 'fechado' })
      .eq('id', conversaId);

    if (updateError) throw updateError;

    // 3. Preparar a Pesquisa Dinâmica (CSAT)
    // Conforme o PRD, a pesquisa pode mudar mensalmente. 
    // Aqui usamos um modelo "gamificado" com emojis.
    const mesAtual = new Date().toLocaleString('pt-BR', { month: 'long' });
    const pergunta = `Sua opinião move o nosso canal! 🚀\n\nComo você avalia o atendimento de hoje com o nosso time?\n\n(Campanha de ${mesAtual})`;

    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '⭐', callback_data: `csat:1:${conversaId}` },
          { text: '⭐⭐', callback_data: `csat:2:${conversaId}` },
          { text: '⭐⭐⭐', callback_data: `csat:3:${conversaId}` },
          { text: '⭐⭐⭐⭐', callback_data: `csat:4:${conversaId}` },
          { text: '⭐⭐⭐⭐⭐', callback_data: `csat:5:${conversaId}` },
        ]
      ]
    };

    // 4. Enviar para o Telegram
    await sendTelegramMessage(
      conversa.bots_config.token_telegram, 
      conversa.clientes.telegram_id, 
      pergunta,
      inlineKeyboard
    );

    return NextResponse.json({ success: true, message: 'Atendimento encerrado e CSAT enviado' });

  } catch (error: any) {
    console.error('Erro ao fechar conversa:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
