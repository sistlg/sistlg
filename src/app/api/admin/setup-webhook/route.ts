import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { setWebhook } from '@/lib/telegram';

/**
 * ROTA ADMINISTRATIVA PARA CONFIGURAR O WEBHOOK DO TELEGRAM.
 * Esta rota deve ser protegida ou removida após o uso.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botId = searchParams.get('botId');

    if (!botId) {
      return NextResponse.json({ error: 'botId is required' }, { status: 400 });
    }

    // 1. Buscar token do bot
    const { data: bot, error } = await supabaseAdmin
      .from('bots_config')
      .select('token_telegram')
      .eq('id', botId)
      .single();

    if (error || !bot) {
      return NextResponse.json({ error: 'Bot not found in database' }, { status: 404 });
    }

    // 2. Definir a URL do Webhook (Vercel)
    const vercelUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sistlg.vercel.app';
    const webhookUrl = `${vercelUrl}/api/webhooks/telegram/${botId}`;

    // 3. Registrar no Telegram
    const result = await setWebhook(bot.token_telegram, webhookUrl);

    return NextResponse.json({
      message: 'Tentativa de configuração concluída',
      webhookUrl,
      telegramResponse: result
    });

  } catch (error: any) {
    console.error('Erro no Setup Webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
