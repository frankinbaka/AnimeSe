# AnimeSe

Site de animes em português: temporada atual, busca com dados do MyAnimeList, lista pessoal, avaliações da comunidade, perfis públicos, criadores de conteúdo e painel de admin.

- **Site:** https://animese.vercel.app
- **Front-end:** HTML, CSS e JavaScript puro, sem etapa de build
- **Dados de anime:** API oficial do MyAnimeList, por meio de funções da Vercel (`api/`)
- **Login e banco:** Supabase (login com Google, PostgreSQL, Storage)
- **Hospedagem:** Vercel, que publica sozinha a cada `git push` na branch `main`

---

## O que o site tem

| Página | O que faz |
|---|---|
| `index.html` | Carrossel com parallax (destaques do admin e melhores da temporada), temporada atual, sugeridos pela comunidade, mais bem avaliados e próximos lançamentos |
| `buscar.html` | Busca por nome, com paginação |
| `anime.html?id=` | Sinopse em português, notas (MAL e AnimeSe), franquia (temporadas, filmes e OVAs), marcar na lista, avaliações de 1 a 10 com respostas e likes, sugerir para a comunidade |
| `sortear.html` | **O que assistir?** Sorteio por gêneros, público, formato e nota mínima |
| `comunidade.html` | Animes mais sugeridos e últimas avaliações |
| `lista.html` | Minha lista: assistindo, já assisti, pretendo assistir, dropei |
| `perfil.html` | Editar perfil: foto, nick, anime favorito e tag (ex.: **SAO**), sobre mim, pedido de criador de conteúdo |
| `usuario.html?id=` | Perfil público: assistidos, avaliações, comentários, sugestões e vídeos (criadores) |
| `post.html?id=` | Uma publicação do admin (notícia, resenha ou vídeo) |
| `admin.html` | Painel admin: estatísticas, publicações, pedidos de criador e denúncias |
| `feed.html` | Feed de vídeos estilo TikTok (**desativado**, veja abaixo) |

### Regras importantes
- **Perfil público** mostra só os animes **já assistidos**; o restante da lista é visível apenas para o dono (regra no banco).
- **Criador de conteúdo** precisa de aprovação: o usuário pede em *Editar perfil*, o admin aprova ou recusa na aba *Criadores*. Links e vídeos só aparecem depois da aprovação.
- **Moderação:** o admin vê **Remover (admin)** nas avaliações e respostas de qualquer pessoa na página do anime.
- **Visitas** (estatísticas do admin) contam uma vez por entrada no site, não por página; visitas do próprio admin não contam.

### Ligar ou desligar o Feed
Em `js/config.js`, mude `FEED_ATIVO` para `true` ou `false` e faça `git push`. Os dados do feed continuam no banco enquanto ele está desligado.

---

## Configuração do zero

### 1. Chave do MyAnimeList (obrigatória)
1. Em [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig), clique em **Create ID** (tipo **web**, endereços com o link do site na Vercel).
2. Copie o **Client ID** (o Client Secret não é usado).
3. Na Vercel: projeto > **Settings > Environments > Production > Environment Variables** > *Key* `MAL_CLIENT_ID`, *Value* o Client ID.
4. Faça **Redeploy** do último deploy.

### 2. Banco de dados (Supabase)
No **SQL Editor** do Supabase, rode os arquivos de `supabase/` **nesta ordem**. Todos podem ser rodados de novo sem estragar nada.

| Ordem | Arquivo | O que cria |
|---|---|---|
| 1 | `schema.sql` | Perfis e lista de animes |
| 2 | `etapa3_comunidade.sql` | Avaliações, respostas, likes, sugestões e a função `is_admin` |
| 3 | `etapa2_conteudo.sql` | Publicações do admin, capas, contador de visitas e estatísticas |
| 4 | `etapa4_perfil_publico.sql` | Campos do perfil público e de criador |
| 5 | `etapa5_criadores.sql` | Pedido e aprovação de criadores; perfil público só com "já assisti" |
| 6 | `etapa6_feed.sql` | Feed de vídeos, curtidas, republicações e denúncias |
| 7 | `etapa7_avatar.sql` | Pasta das fotos de perfil |

> Os nomes "etapa" seguem a ordem em que as funções foram criadas, por isso a etapa 3 vem antes da 2.

**Tornar alguém admin** (o site não deixa ninguém se promover sozinho):
```sql
update public.profiles set role = 'admin' where nickname = 'SEU_NICK';
```

### 3. Login com Google
1. No Supabase: **Authentication > Sign In / Providers > Google**, copie o *Callback URL*.
2. No [Google Cloud Console](https://console.cloud.google.com), em **Google Auth Platform**: configure o app (público **Externo**), crie um **cliente Web** com a origem `https://animese.vercel.app` e o *Callback URL* do Supabase como redirecionamento, e **publique o app** em *Público-alvo*.
3. De volta ao Supabase, ative o Google e cole o *Client ID* e o *Client Secret*.
4. Em **Authentication > URL Configuration**: *Site URL* `https://animese.vercel.app` e, em *Redirect URLs*, `https://animese.vercel.app/**`.
5. Em `js/config.js`, `SUPABASE_URL` e `SUPABASE_ANON_KEY` com os dados de **Project Settings > API Keys** (a chave *anon* é pública; quem protege os dados são as regras do banco).

### 4. Tradução das sinopses (opcional, recomendado)
Sem configurar nada, as sinopses são traduzidas pelo tradutor público do Google, que é gratuito mas não oficial. Para usar o **DeepL**:
1. Crie uma conta no plano gratuito da API do DeepL ([deepl.com/pro-api](https://www.deepl.com/pro-api)).
2. Em **Conta > Chaves de API**, copie a chave (a do plano gratuito termina em `:fx`).
3. Na Vercel, crie a variável `DEEPL_API_KEY` com essa chave e faça **Redeploy**.

As traduções ficam 30 dias em cache; as sinopses já traduzidas pelo Google passam para o DeepL conforme esse cache vence. Se o DeepL falhar (cota esgotada, por exemplo), o site volta para o Google sozinho.

---

## Rodar no seu computador

As funções de `api/` só rodam no servidor da Vercel. Na pasta do projeto:
```bash
npx vercel dev
```
Na primeira vez ele pede para entrar na conta e ligar a pasta ao projeto. As variáveis de ambiente vêm com `npx vercel env pull`.

---

## Estrutura

```
├── *.html                    uma página por arquivo (lista na tabela acima)
├── api/                      funções da Vercel (guardam as chaves)
│   ├── mal.js                ponte com a API do MyAnimeList
│   ├── traduzir.js           sinopse em português (DeepL ou Google), cache de 30 dias
│   ├── temporadas.js         franquia: temporadas, filmes e OVAs em ordem de estreia
│   └── catalogo.js           1.500 animes populares com gêneros, para o sorteio
├── css/style.css             todo o visual
├── js/
│   ├── config.js             chaves públicas do Supabase, nome do site, FEED_ATIVO
│   ├── store.js              login, perfil, foto, lista
│   ├── mal.js                dados dos animes e traduções (títulos, gêneros, tipos)
│   ├── comunidade.js         avaliações, respostas, likes, sugestões
│   ├── conteudo.js           publicações do admin
│   ├── perfis.js             perfil público, criadores, vídeos incorporados
│   ├── feed.js               feed e denúncias
│   ├── carrossel.js          carrossel com parallax
│   ├── ui.js                 cabeçalho, menu, cartões, tag do favorito
│   └── paginas/              código de cada página
└── supabase/                 arquivos SQL (ordem na tabela acima)
```

---

## Próximas ideias
- Chat online para usuários logados
- Feed de vídeos (pronto, desativado)
- Área para criadores de arte e desenho
- Vídeos do canal do YouTube puxados automaticamente
- Admin resetar a foto de um usuário e corrigir sinopses traduzidas

---

© AnimeSe, desenvolvido por Frank Matheus. Dados de animes: [MyAnimeList](https://myanimelist.net); o AnimeSe não tem ligação oficial com o MyAnimeList.
