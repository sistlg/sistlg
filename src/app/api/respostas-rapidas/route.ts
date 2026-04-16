import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('respostas_rapidas')
      .select('*')
      .eq('atendente_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ respostas: data || [] });
  } catch (error: any) {
    console.error('Erro buscando respostas_rapidas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { titulo, categoria, conteudo } = await request.json();

    if (!titulo || !conteudo) {
      return NextResponse.json({ error: 'Título e Conteúdo são obrigatórios.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('respostas_rapidas')
      .insert({
        atendente_id: user.id,
        titulo,
        categoria: categoria || 'Sem Categoria',
        conteudo
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, resposta: data });
  } catch (error: any) {
    console.error('Erro ao salvar resposta rapida:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
