import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { conversaId, atendenteId, conteudo } = await request.json();

    if (!conversaId || !conteudo) {
      return NextResponse.json({ error: 'ID da conversa e conteúdo são obrigatórios' }, { status: 400 });
    }

    // 1. Salvar na tabela de mensagens_internas
    const { error } = await supabaseAdmin
      .from('mensagens_internas')
      .insert({
        conversa_id: conversaId,
        atendente_id: atendenteId || null, // No futuro virá do auth
        conteudo: conteudo
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao enviar mensagem interna:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
