import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'missing-key-check-env',
});

/**
 * Utilitário para gerar embeddings de um texto.
 * Utilizado para busca semântica na base de conhecimento.
 */
export async function generateEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.replace(/\n/g, ' '),
  });

  return response.data[0].embedding;
}

/**
 * Analisa o sentimento de um texto.
 * Retorna 'positivo', 'negativo' ou 'neutro'.
 */
export async function analyzeSentiment(text: string): Promise<'positivo' | 'negativo' | 'neutro'> {
  if (!text || text.length < 3) return 'neutro';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Analise o sentimento da mensagem do cliente e responda APENAS com uma das palavras: positivo, negativo, neutro.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: 10,
    });

    const sentiment = response.choices[0].message.content?.toLowerCase().trim();
    if (sentiment?.includes('positivo')) return 'positivo';
    if (sentiment?.includes('negativo')) return 'negativo';
    return 'neutro';
  } catch (error) {
    console.error('Erro ao analisar sentimento:', error);
    return 'neutro';
  }
}

/**
 * Refina uma mensagem escrita pelo atendente.
 * Melhora tom, clareza e empatia.
 */
export async function refineMessage(text: string): Promise<string> {
  if (!text || text.length < 5) return text;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um Assistente de Qualidade em Atendimento ao Cliente. 
Sua tarefa é REESCREVER a mensagem fornecida pelo atendente para que ela seja mais profissional, empática e clara, mantendo o sentido original.
Diretrizes:
- Use um tom cordial.
- Corrija erros gramaticais.
- Seja conciso (não adicione informações irreais).
- Retorne APENAS o texto reescrito.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: 200,
    });

    return response.choices[0].message.content?.trim() || text;
  } catch (error) {
    console.error('Erro ao refinar mensagem:', error);
    return text;
  }
}
