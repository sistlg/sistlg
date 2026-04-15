import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const { conversaId, conteudo, atendenteId } = await request.json();

    if (!conversaId || !conteudo) {
      return NextResponse.json({ error: 'Faltam parâmetros obrigatórios' }, { status: 400 });
    }

    // 1. Buscar a conversa completa (incluindo dados do Bot e do Cliente)
    const { data: conversa, error: convError } = await supabaseAdmin
      .from('conversas')
      .select(`
        *,
        clientes (telegram_id),
        bots_config (token_telegram)
      `)
      .eq('id', conversaId)
      .single();

    if (convError || !conversa) {
      console.error('Conversa não encontrada:', convError);
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    // 2. Enviar mensagem via API do Telegram
    const token = conversa.bots_config?.token_telegram;
    const chatId = conversa.clientes?.telegram_id;

    if (!token || !chatId) {
       return NextResponse.json({ error: 'Configuração do Telegram ausente' }, { status: 400 });
    }

    const telegramReponse = await sendTelegramMessage(token, chatId, conteudo);

    if (!telegramReponse.ok) {
       console.error('Erro na API do Telegram:', telegramReponse);
       return NextResponse.json({ error: 'Erro ao enviar para o Telegram' }, { status: 500 });
    }

    // 3. Salvar mensagem no banco de dados
    const { error: msgError } = await supabaseAdmin
      .from('mensagens')
      .insert({
        conversa_id: conversaId,
        remetente: atendenteId || 'atendente', 
        tipo: 'texto',
        conteudo: conteudo,
      });

    if (msgError) throw msgError;

    // 4. Atualizar última_mensagem na conversa
    await supabaseAdmin
      .from('conversas')
      .update({ última_mensagem_at: new Date().toISOString() })
      .eq('id', conversaId);

    return NextResponse.json({ success: true, message: 'Mensagem enviada com sucesso' });

  } catch (error: any) {
    console.error('Erro no envio de mensagem:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
