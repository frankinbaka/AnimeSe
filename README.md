# AnimeSe

Site de animes com os lançamentos da temporada, busca com dados do MyAnimeList e uma lista pessoal para cada usuário (assistindo, já assisti, pretendo assistir, dropei).

Feito com HTML, CSS e JavaScript puro, sem etapa de build. Dados de animes vêm da [API oficial do MyAnimeList](https://myanimelist.net/apiconfig/references/api/v2), por meio de uma pequena função na Vercel (`api/mal.js`) que guarda a chave e login e banco de dados ficam no [Supabase](https://supabase.com).

## Páginas

| Página | O que faz |
|---|---|
| `index.html` | Destaque e animes da temporada atual, mais bem avaliados e próximos lançamentos |
| `buscar.html` | Busca por nome, com paginação |
| `anime.html?id=` | Sinopse, nota, ranking, episódios, gêneros e botões para marcar na lista |
| `lista.html` | Minha lista, separada por status |
| `perfil.html` | Nick, anime favorito e a tag que aparece ao lado do nome (ex.: **SAO**) |

## Chave do MyAnimeList (obrigatória)

1. Entre em [myanimelist.net/apiconfig](https://myanimelist.net/apiconfig) com sua conta do MAL e clique em **Create ID**.
2. *App Type*: **web**. Em *App Redirect URL* e *Homepage URL*, use o endereço do site na Vercel.
3. Copie o **Client ID** (o Client Secret não é usado).
4. Na Vercel, abra o projeto > **Settings > Environment Variables** e crie:
   - *Key*: `MAL_CLIENT_ID`
   - *Value*: o Client ID copiado
5. Em **Deployments**, abra o menu (⋯) do último deploy e clique em **Redeploy** para a chave valer.

A chave fica só na Vercel, nunca no código do site.

## Rodar no seu computador

A ponte com o MyAnimeList (`api/mal.js`) é uma função da Vercel, então para testar no PC use o servidor da própria Vercel, dentro da pasta do projeto:

```bash
npx vercel dev
```

Na primeira vez ele pede para entrar na conta e ligar a pasta ao projeto. As variáveis de ambiente são baixadas da Vercel com `npx vercel env pull`.

Sem o Supabase configurado, o site roda em **modo demonstração**: o login é simulado e a lista fica salva só no navegador.

## Ativar o login com Google (Supabase)

1. **Criar o projeto:** em [supabase.com](https://supabase.com), crie uma conta e um projeto novo (plano gratuito).
2. **Criar as tabelas:** em *SQL Editor*, cole o conteúdo de `supabase/schema.sql` e clique em *Run*.
3. **Credenciais do Google:**
   - No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um projeto, configure a *Tela de consentimento OAuth* e crie um *ID do cliente OAuth* do tipo *Aplicativo da Web*.
   - Em *URIs de redirecionamento autorizados*, coloque o endereço mostrado no Supabase em *Authentication > Sign In / Providers > Google* (termina em `/auth/v1/callback`).
4. **Ligar o Google no Supabase:** em *Authentication > Sign In / Providers > Google*, ative e cole o *Client ID* e o *Client Secret*.
5. **Endereços do site:** em *Authentication > URL Configuration*, coloque em *Site URL* o endereço do site publicado e, em *Redirect URLs*, adicione também `http://localhost:5500/**` para testar no seu PC.
6. **Conectar o site:** em *Project Settings > API*, copie a *Project URL* e a *anon public key* para `js/config.js`.

A *anon key* é pública por natureza. Quem protege os dados são as regras de segurança (RLS) do `schema.sql`: cada usuário só lê e altera a própria lista e o próprio perfil.

## Publicar

O site é estático, então pode ser publicado de graça na [Vercel](https://vercel.com) ou na [Netlify](https://netlify.com):

1. Entre com sua conta do GitHub e importe este repositório.
2. Não precisa de comando de build nem pasta de saída: é só publicar a raiz.
3. Copie o endereço gerado (ex.: `animese.vercel.app`) para o *Site URL* do Supabase (passo 5 acima).

A cada `git push`, o site é atualizado sozinho.

## Estrutura

```
├── index.html, buscar.html, anime.html, lista.html, perfil.html
├── css/style.css          estilos e paleta
├── js/config.js           chaves do Supabase e nome do site
├── api/mal.js            função da Vercel: ponte com a API do MyAnimeList (guarda a chave)
├── js/mal.js              dados dos animes e tradução de tipos, situação e gêneros
├── js/store.js            login, perfil e lista (Supabase ou modo demo)
├── js/ui.js               cabeçalho, menu, cards e a tag do favorito
├── js/paginas/            código de cada página
└── supabase/schema.sql    tabelas e regras de segurança
```

## Próximas etapas

- Área de admin (a coluna `role` já existe em `profiles`; um admin é definido direto no Supabase)
- Notícias de animes na página inicial
- Perfil público com a lista de outros usuários
- Tradução automática das sinopses para português (com cache no banco e correção manual pelo admin)

---

Dados de animes: [MyAnimeList](https://myanimelist.net). O AnimeSe não tem ligação oficial com o MyAnimeList.
