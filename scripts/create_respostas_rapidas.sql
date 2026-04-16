-- Tabela para armazenar as Respostas Rápidas (Quick Replies) do atendente
CREATE TABLE IF NOT EXISTS public.respostas_rapidas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    atendente_id UUID REFERENCES public.atendentes(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    categoria TEXT DEFAULT 'Sem Categoria',
    conteudo TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Políticas de RLS (Row Level Security) para Atendentes Apenas Verem e Editarem as suas
ALTER TABLE public.respostas_rapidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Atendentes podem ver suas próprias respostas rápidas"
ON public.respostas_rapidas
FOR SELECT
USING (auth.uid() = atendente_id);

CREATE POLICY "Atendentes podem criar suas próprias respostas rápidas"
ON public.respostas_rapidas
FOR INSERT
WITH CHECK (auth.uid() = atendente_id);

CREATE POLICY "Atendentes podem atualizar suas próprias respostas rápidas"
ON public.respostas_rapidas
FOR UPDATE
USING (auth.uid() = atendente_id)
WITH CHECK (auth.uid() = atendente_id);

CREATE POLICY "Atendentes podem deletar suas próprias respostas rápidas"
ON public.respostas_rapidas
FOR DELETE
USING (auth.uid() = atendente_id);
