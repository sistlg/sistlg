import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'missing-key-check-env',
});

function getClient(apiKey?: string) {
  if (apiKey && apiKey.trim().length > 0) {
    return new OpenAI({ apiKey });
  }
  return openai;
}

/**
 * Utilitário para gerar embeddings de um texto.
 * Utilizado para busca semântica na base de conhecimento.
 */
export async function generateEmbedding(text: string, customApiKey?: string) {
  const client = getClient(customApiKey);
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.replace(/\n/g, ' '),
  });

  return response.data[0].embedding;
}

/**
 * Analisa o sentimento de um texto.
 * Retorna 'positivo', 'negativo' ou 'neutro'.
 */
export async function analyzeSentiment(text: string, customApiKey?: string): Promise<'positivo' | 'negativo' | 'neutro'> {
  if (!text || text.length < 3) return 'neutro';

  try {
    const client = getClient(customApiKey);
    const response = await client.chat.completions.create({
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
export async function refineMessage(text: string, customApiKey?: string): Promise<string> {
  if (!text || text.length < 5) return text;

  try {
    const client = getClient(customApiKey);
    const response = await client.chat.completions.create({
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

/**
 * Gera uma resposta autônoma para o cliente.
 * Usa o contexto da conversa para ser mais preciso.
 */
export async function generateAIResponse(history: { role: 'user' | 'assistant', content: string }[], botName: string = 'sistlg', customApiKey?: string): Promise<string | null> {
  if (history.length === 0) return null;

  try {
    const client = getClient(customApiKey);
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é o assistente virtual da empresa SISTLG, chamado ${botName}.
Seu objetivo é realizar o primeiro atendimento de forma cordial, empática e eficiente.
Instruções:
- Seja conciso e use uma linguagem profissional, porém amigável.
- Se o cliente perguntar algo que você não sabe, diga que vai encaminhá-lo para um atendente humano em instantes.
- NUNCA invente informações sobre a empresa.
- Use emojis moderadamente para tornar a conversa leve.`
        },
        ...history
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return response.choices[0].message.content?.trim() || null;
  } catch (error) {
    console.error('Erro ao gerar resposta da IA:', error);
    return null;
  }
}
