-- ==========================================
-- SISTLG: Esquema de Banco de Dados Final
-- ==========================================

-- 0. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Atendentes
CREATE TABLE IF NOT EXISTS atendentes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    cargo TEXT,
    avatar_url TEXT,
    status TEXT DEFAULT 'offline',
    pontos_gamificacao INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Configuração dos Bots
CREATE TABLE IF NOT EXISTS bots_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    atendente_id UUID REFERENCES atendentes(id) ON DELETE CASCADE,
    nome_bot TEXT NOT NULL,
    token_telegram TEXT UNIQUE NOT NULL,
    username_bot TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    nome TEXT,
    username TEXT,
    telefone TEXT,
    consentimento_lgpd BOOLEAN DEFAULT false,
    data_consentimento TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Conversas
CREATE TABLE IF NOT EXISTS conversas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES bots_config(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'aberto',
    última_mensagem_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Mensagens (Suporte a Busca Semântica via pgvector)
CREATE TABLE IF NOT EXISTS mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversa_id UUID REFERENCES conversas(id) ON DELETE CASCADE,
    remetente TEXT NOT NULL,
    tipo TEXT DEFAULT 'texto',
    conteudo TEXT,
    media_url TEXT,
    sentimento TEXT,
    embedding VECTOR(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Mensagens Internas (Chat Equipe)
CREATE TABLE IF NOT EXISTS mensagens_internas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversa_id UUID REFERENCES conversas(id) ON DELETE CASCADE,
    atendente_id UUID REFERENCES atendentes(id) ON DELETE CASCADE,
    conteudo TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Pesquisas de Satisfação (CSAT)
CREATE TABLE IF NOT EXISTS pesquisas_satisfacao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversa_id UUID REFERENCES conversas(id) ON DELETE CASCADE,
    atendente_id UUID REFERENCES atendentes(id) ON DELETE CASCADE,
    nota INTEGER CHECK (nota >= 1 AND nota <= 5),
    comentario TEXT,
    mes_referencia TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- FUNÇÕES E TRIGGERS (RPC)
-- ==========================================

-- Função para incrementar pontos do atendente (Gamificação)
CREATE OR REPLACE FUNCTION increment_atendente_points(atendente_row_id UUID, pontos INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE atendentes
  SET pontos_gamificacao = COALESCE(pontos_gamificacao, 0) + pontos
  WHERE id = atendente_row_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Exemplo de visualização (View) para Dashboard
CREATE OR REPLACE VIEW view_stats_atendentes AS
SELECT 
    a.nome,
    a.pontos_gamificacao,
    COUNT(p.id) as total_pesquisas,
    AVG(p.nota) as media_csat
FROM atendentes a
LEFT JOIN pesquisas_satisfacao p ON p.atendente_id = a.id
GROUP BY a.id, a.nome, a.pontos_gamificacao;
