import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Carregar variáveis do .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Erro: Variáveis de ambiente SUPABASE_URL ou SERVICE_ROLE_KEY não encontradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAtendente(email: string, pass: string, nome: string) {
  console.log(`🚀 Iniciando criação/atualização do atendente: ${nome} (${email})...`);

  let userId: string;

  // 1. Tentar criar usuário no Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: pass,
    email_confirm: true,
    user_metadata: { nome }
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('ℹ️ Usuário já existe no Auth. Recuperando ID...');
      // Buscar usuário pelo email
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        console.error('❌ Erro ao listar usuários:', listError.message);
        return;
      }
      const existingUser = listData.users.find(u => u.email === email);
      if (!existingUser) {
        console.error('❌ Erro: Usuário não encontrado na lista apesar do erro de duplicidade.');
        return;
      }
      userId = existingUser.id;
    } else {
      console.error('❌ Erro ao criar usuário no Auth:', authError.message);
      return;
    }
  } else {
    userId = authData.user.id;
    console.log('✅ Usuário criado no Supabase Auth com ID:', userId);
  }

  // 2. Criar ou Atualizar registro na tabela pública 'atendentes' (Upsert)
  const { error: dbError } = await supabase
    .from('atendentes')
    .upsert({
      id: userId,
      nome: nome,
      email: email,
      status: 'offline'
    }, { onConflict: 'id' });

  if (dbError) {
    console.error('❌ Erro ao registrar na tabela atendentes:', dbError.message);
    return;
  }

  console.log('✨ Atendente sincronizado com sucesso no banco de dados!');
  console.log('--------------------------------------------------');
  console.log('Credenciais verificadas:');
  console.log(`Email: ${email}`);
  console.log(`Senha: [Mantida ou Atualizada]`);
  console.log('--------------------------------------------------');
}

// Exemplo de uso ou via argumentos de linha de comando
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: npx tsx scripts/setup-admin.ts <email> <password> <name>');
} else {
  createAtendente(args[0], args[1], args[2]);
}
