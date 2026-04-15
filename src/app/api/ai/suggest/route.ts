import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { openai } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { conversaId } = await request.json();

    if (!conversaId) {
      return NextResponse.json({ error: 'ID da conversa é obrigatório' }, { status: 400 });
    }

    // 1. Buscar últimas mensagens da conversa para dar contexto para a IA
    const { data: mensagens, error: msgError } = await supabaseAdmin
      .from('mensagens')
      .select('remetente, conteudo, created_at')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: false })
      .limit(10); // pega as ultimas 10 mensagens

    if (msgError || !mensagens) {
      throw new Error('Erro ao buscar mensagens');
    }

    // Como pegamos `ascending: false` com limite, as mensagens vêm das mais recentes pras mais antigas.
    // Invertemos para ficar na ordem cronológica
    const contexto = mensagens.reverse().map(m => `${m.remetente}: ${m.conteudo}`).join('\n');

    // 2. Chamar OpenAI
    const response = await openai.chat.completions.create({
       model: 'gpt-4o-mini',
       messages: [
         {
           role: 'system',
           content: `Você é um assistente de IA focado em sugerir respostas curtas, amigáveis e precisas para atendentes de suporte que estão conversando via Telegram. 
Sua tarefa é ler as últimas mensagens da conversa e fornecer UMA sugestão de reposta (apenas o texto da sugestão) que o atendente humano pode enviar.
Diretrizes:
- Seja prestativo, claro e objetivo.
- Tom: Profissional mas caloroso.
- Se a última mensagem for do atendente ou de sistema, sugira qual deveria ser o próximo passo (follow up).`
         },
         {
           role: 'user',
           content: `Aqui estão as últimas mensagens:\n${contexto}\n\nBaseado nisso, o que o atendente deveria responder?`
         }
       ],
       max_tokens: 150,
       temperature: 0.7,
    });

    const sugestao = response.choices[0].message.content?.trim();

    return NextResponse.json({ sugestao });
  } catch (error: any) {
    console.error('Erro na IA Sugestão:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
