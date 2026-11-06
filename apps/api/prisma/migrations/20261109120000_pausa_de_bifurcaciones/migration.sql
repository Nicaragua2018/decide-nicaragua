-- Inicio de la pausa de una bifurcación: al reanudarse, sus plazos se corren lo que duró.
ALTER TABLE "groups" ADD COLUMN "pausadaAt" TIMESTAMPTZ;
