# AnimeSe

Site de animes com os lançamentos da temporada, busca com dados do MyAnimeList e uma lista pessoal para cada usuário (assistindo, já assisti, pretendo assistir, dropei).

Feito com HTML, CSS e JavaScript puro, sem etapa de build. Dados de animes vêm da [API Jikan](https://docs.api.jikan.moe) (MyAnimeList) e login e banco de dados ficam no [Supabase](https://supabase.com).

## Páginas

| Página | O que faz |
|---|---|
| `index.html` | Destaque e animes da temporada atual, mais bem avaliados e próximos lançamentos |
| `buscar.html` | Busca por nome, com paginação |
| `anime.html?id=` | Sinopse, nota, episódios, gêneros, trailer e botões para marcar na lista |
| `lista.html` | Minha lista, separada por status |
| `perfil.html` | Nick, anime favorito e a tag que aparece ao lado do nome (ex.: **SAO**) |

## Rodar no seu computador

Os arquivos usam módulos JavaScript, então precisam de um servidor local (abrir o `index.html` direto com dois cliques não funciona). Qualquer uma destas opções serve, dentro da pasta do projeto:

```bash
# Com Python
python -m http.server 5500

# Ou com Node
npx serve .
```

Depois abra `http://localhost:5500`. No VS Code, a extensão **Live Server** também funciona.

Sem configurar nada, o site roda em **modo demonstração**: o login é simulado e a lista fica salva só no navegador. Serve para testar tudo antes de criar o banco.

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
├── js/jikan.js            dados do MyAnimeList (com fila e cache por causa do limite da API)
├── js/store.js            login, perfil e lista (Supabase ou modo demo)
├── js/ui.js               cabeçalho, menu, cards e a tag do favorito
├── js/paginas/            código de cada página
└── supabase/schema.sql    tabelas e regras de segurança
```

## Próximas etapas

- Área de admin (a coluna `role` já existe em `profiles`; um admin é definido direto no Supabase)
- Notícias de animes na página inicial
- Perfil público com a lista de outros usuários
- Tradução das sinopses para português

---

Dados de animes: [MyAnimeList](https://myanimelist.net) via [Jikan](https://jikan.moe). O AnimeSe não tem ligação oficial com o MyAnimeList.
