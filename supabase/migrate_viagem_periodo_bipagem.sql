-- Período real de bipagem (início/fim), independente de data_hora dos itens gravados em lote.
CREATE TABLE IF NOT EXISTS public.viagem_periodo_bipagem (
    id_viagem TEXT NOT NULL,
    fluxo TEXT NOT NULL DEFAULT 'carregamento',
    inicio_em TIMESTAMPTZ NOT NULL,
    fim_em TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id_viagem, fluxo)
);
