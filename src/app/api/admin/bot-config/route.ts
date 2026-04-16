import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, openai_api_key } = body;

    if (!botId) {
      return NextResponse.json({ error: 'botId é obrigatório' }, { status: 400 });
    }

    if (!openai_api_key) {
      return NextResponse.json({ error: 'openai_api_key é obrigatório' }, { status: 400 });
    }

    // Atualizar a configuração do bot
    const { data, error } = await supabaseAdmin
      .from('bots_config')
      .update({ openai_api_key })
      .eq('id', botId)
      .select()
      .single();

    if (error) {
      console.error('Erro ao atualizar bot_config:', error);
      return NextResponse.json({ error: 'Erro ao atualizar chave da OpenAI' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Chave atualizada com sucesso', data });

  } catch (error: any) {
    console.error('Erro no setup da IA:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
