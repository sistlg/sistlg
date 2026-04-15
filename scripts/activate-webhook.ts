import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis do .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// DOMÍNIO DE PRODUÇÃO (Conforme informado pelo usuário)
const BASE_URL = 'https://sistlg.vercel.app';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erro: Variáveis de ambiente Supabase não encontradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function activateWebhooks() {
  console.log(`🌐 Iniciando ativação de Webhooks para: ${BASE_URL}`);

  // 1. Buscar todos os bots ativos
  const { data: bots, error } = await supabase
    .from('bots_config')
    .select('id, token_telegram, nome_bot')
    .eq('is_active', true);

  if (error) {
    console.error('❌ Erro ao buscar bots:', error.message);
    return;
  }

  if (!bots || bots.length === 0) {
    console.log('ℹ️ Nenhum bot ativo encontrado no banco de dados.');
    return;
  }

  console.log(`🤖 Encontrados ${bots.length} bots. Configurando...`);

  for (const bot of bots) {
    const webhookUrl = `${BASE_URL}/api/webhooks/telegram/${bot.id}`;
    
    console.log(`\n⚙️ Configurando Bot: ${bot.nome_bot}`);
    console.log(`🔗 Webhook URL: ${webhookUrl}`);

    try {
      const resp = await fetch(`https://api.telegram.org/bot${bot.token_telegram}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });

      const result = await resp.json();

      if (result.ok) {
        console.log(`✅ Webhook ativado com sucesso para ${bot.nome_bot}!`);
      } else {
        console.error(`❌ Falha ao ativar Webhook: ${result.description}`);
      }
    } catch (err: any) {
      console.error(`❌ Erro na chamada da API do Telegram: ${err.message}`);
    }
  }

  console.log('\n✨ Processo de ativação concluído!');
}

activateWebhooks();
