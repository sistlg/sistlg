import { NextRequest, NextResponse } from 'next/server';
import { refineMessage } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 });
    }

    const refined = await refineMessage(message);

    return NextResponse.json({ refined });
  } catch (error: any) {
    console.error('Erro ao refinar mensagem:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
