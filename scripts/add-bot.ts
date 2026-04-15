import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis do .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erro: Variáveis de ambiente Supabase não encontradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addBot(token: string, nomeBot: string, emailAtendente: string) {
  console.log(`🤖 Registrando bot: ${nomeBot}...`);

  // 1. Buscar o ID do atendente pelo email
  const { data: atendente, error: atendenteError } = await supabase
    .from('atendentes')
    .select('id')
    .eq('email', emailAtendente)
    .single();

  if (atendenteError || !atendente) {
    console.error('❌ Erro: Atendente não encontrado com esse e-mail. Rode o setup-admin primeiro!');
    return;
  }

  // 2. Inserir na tabela bots_config
  const { data: newBot, error: botError } = await supabase
    .from('bots_config')
    .insert({
      atendente_id: atendente.id,
      nome_bot: nomeBot,
      token_telegram: token,
      is_active: true
    })
    .select()
    .single();

  if (botError) {
    if (botError.message.includes('unique_token_telegram')) {
       console.error('❌ Erro: Este token de bot já está cadastrado!');
    } else {
       console.error('❌ Erro ao registrar bot:', botError.message);
    }
    return;
  }

  console.log('✅ Bot registrado com sucesso!');
  console.log(`ID do Bot: ${newBot.id}`);
  console.log('Agora você pode rodar o scripts/activate-webhook.ts para ativar a conexão.');
}

// Uso: npx tsx scripts/add-bot.ts <TELEGRAM_TOKEN> <NOME_BOT> <EMAIL_ATENDENTE>
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: npx tsx scripts/add-bot.ts <TELEGRAM_TOKEN> <NOME_BOT> <EMAIL_ATENDENTE>');
} else {
  addBot(args[0], args[1], args[2]);
}
