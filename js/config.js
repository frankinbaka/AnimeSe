// ============================================================
// Configuração do Supabase
// ------------------------------------------------------------
// Preencha com os dados do seu projeto (Supabase > Project
// Settings > API). A "anon key" é pública e pode ficar aqui:
// quem protege os dados são as regras (RLS) do arquivo
// supabase/schema.sql.
//
// Enquanto os campos estiverem vazios, o site roda em MODO DEMO:
// o login é simulado e tudo fica salvo só no seu navegador.
// ============================================================

export const SUPABASE_URL = "https://nfcobuqwpphswostlyks.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY29idXF3cHBoc3dvc3RseWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MjczOTQsImV4cCI6MjEwODQwMzM5NH0.vXO-YMlzidCzSrkOJ1uy3FzteacY4pPfBpta9rIs4oo";

export const NOME_DO_SITE = "AnimeSe";
export const AUTOR_DO_SITE = "Frank Matheus";

// Liga/desliga o Feed de vídeos (página, menu, denúncias e abas do perfil).
// Os vídeos, curtidas e denúncias já salvos continuam no banco.
export const FEED_ATIVO = false;

// Pix para a página "Apoiar o AnimeSe". Use uma chave aleatória ou e-mail
// (a chave fica visível no site). Com algum campo vazio, a página avisa
// que o Pix ainda não foi configurado.
export const PIX_CHAVE = "60acafaf-f0d8-427d-ab8b-2dbdb53ec061";
export const PIX_NOME = "Frank Matheus B da Silva";    // como aparece no banco, até 25 letras
export const PIX_CIDADE = "Caxias";  // até 15 letras
