import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Retorna o histórico completo de mensagens de um determinado cliente (buscando em todas as suas conversas).
 * Bypassa RLS garantindo que atendentes/administradores tenham a visão centralizada de todo o contato do cliente.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get('clienteId');

    if (!clienteId) {
      return NextResponse.json({ error: 'clienteId é obrigatório' }, { status: 400 });
    }

    // 1. Buscar todas as conversas/sessões deste cliente
    const { data: conversas, error: conversasError } = await supabaseAdmin
      .from('conversas')
      .select('id')
      .eq('cliente_id', clienteId);

    if (conversasError) {
      throw conversasError;
    }

    if (!conversas || conversas.length === 0) {
      return NextResponse.json({ mensagens: [], mensagensInternas: [] });
    }

    const conversasIds = conversas.map(c => c.id);

    // 2. Buscar todas as mensagens que pertencem a essas sessões
    const { data: mensagens, error: msgError } = await supabaseAdmin
      .from('mensagens')
      .select('*')
      .in('conversa_id', conversasIds)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // 3. Buscar todas as mensagens internas vinculadas a essas sessões
    const { data: mensagensInternas, error: miError } = await supabaseAdmin
      .from('mensagens_internas')
      .select('*')
      .in('conversa_id', conversasIds)
      .order('created_at', { ascending: true });

    if (miError) throw miError;

    return NextResponse.json({
      mensagens: mensagens || [],
      mensagensInternas: mensagensInternas || []
    });

  } catch (error: any) {
    console.error('Erro ao buscar histórico unificado:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
