# Controle Financeiro — Supabase + GitHub Pages

## O que você vai ter no final
Um site com URL própria (`https://seu-usuario.github.io/nome-do-repo/`),
acessível de qualquer navegador, com os dados salvos no Supabase (Postgres),
protegidos por login (e-mail e senha).

Por que login agora? O GitHub Pages só serve arquivos estáticos — não existe
"servidor" escondendo nada. Então a chave do banco fica visível no código-fonte
(isso é normal e esperado no Supabase — ela é pública por design). O que
protege seus dados de verdade são as regras de segurança do banco (RLS), que
dizem "cada pessoa só enxerga a própria linha". Por isso agora existe uma tela
de login: sem ela, não teria como saber de quem são os dados.

## Passo 1 — Criar o projeto no Supabase
1. Crie uma conta em https://supabase.com (grátis) e clique em **New project**.
2. Anote a **senha do banco** que você definir (não precisa dela no dia a dia,
   mas guarde por segurança).
3. Aguarde o projeto terminar de provisionar (leva ~1-2 minutos).

## Passo 2 — Criar a tabela e as regras de segurança
1. No painel do projeto, vá em **SQL Editor** → **New query**.
2. Cole e rode o código abaixo:

```sql
create table app_data (
  id uuid primary key references auth.users(id) on delete cascade,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table app_data enable row level security;

create policy "Users can view own data"
  on app_data for select
  using (auth.uid() = id);

create policy "Users can insert own data"
  on app_data for insert
  with check (auth.uid() = id);

create policy "Users can update own data"
  on app_data for update
  using (auth.uid() = id);
```

3. Em **Authentication → Providers**, confirme que **Email** está habilitado
   (vem habilitado por padrão).
4. (Recomendado) Em **Authentication → Settings**, se você não quiser precisar
   confirmar e-mail antes de logar, pode desativar "Confirm email" — mais
   simples para uso pessoal. Deixando ativado, você recebe um e-mail de
   confirmação no cadastro.

## Passo 3 — Credenciais do Supabase
Já estão preenchidas neste `index.html` (URL e chave anon do seu projeto
`edbcgkdtbizupuhiveba`). Não precisa mexer em nada aqui, a menos que troque
de projeto no Supabase.

## Passo 4 — Subir pro GitHub Pages
1. Crie um repositório novo no GitHub (pode ser privado ou público — o conteúdo
   do site em si não é sensível, os dados ficam no Supabase, não no repositório).
2. Envie o `index.html` para a raiz do repositório (pela interface web do
   GitHub: **Add file → Upload files**, ou via `git push` se preferir).
3. Vá em **Settings → Pages** do repositório.
4. Em **Source**, selecione a branch (geralmente `main`) e a pasta `/ (root)`.
5. Salve e aguarde 1-2 minutos — o GitHub mostra a URL final do site.

## Passo 5 — Usar
1. Abra a URL do GitHub Pages.
2. Na primeira vez, clique em **"Criar uma conta nova"**, informe e-mail e
   senha (mínimo 6 caracteres).
3. Se pediu confirmação por e-mail, confirme e volte para fazer login.
4. Pronto — os lançamentos da planilha original já entram automaticamente como
   ponto de partida na primeira vez que você acessa.
5. Em qualquer outro aparelho, é só abrir a mesma URL e logar com o mesmo
   e-mail/senha — os dados são os mesmos, guardados no Supabase.

## Se quiser atualizar o app depois
Edite os arquivos em `css/` e `js/` (ou peça pra mim gerar uma nova versão) e
envie de novo pro mesmo repositório — o GitHub Pages atualiza sozinho. Não é
preciso build: os módulos JS são carregados direto pelo navegador.

## Estrutura dos arquivos
```
MeuFinanceiro/
├── index.html            → apenas a casca HTML (carrega o CSS e o JS)
├── css/
│   └── styles.css        → todo o visual do app
└── js/
    ├── config.js         → constantes e credenciais do Supabase
    ├── seed-data.js       → dados de exemplo usados no primeiro acesso
    ├── utils.js           → formatação de datas/moeda, helpers puros
    ├── domain.js          → regras de negócio (situação, saldo, parcelamento)
    ├── state.js           → estado da aplicação em memória
    ├── app.js             → ponto de entrada, liga UI + API
    ├── api/
    │   ├── client.js      → cliente do Supabase
    │   ├── auth.js        → login/cadastro/logout
    │   └── storage.js     → carregar/salvar os lançamentos
    └── ui/
        ├── dom.js         → referência ao elemento raiz
        ├── toast.js       → mensagens rápidas na tela
        ├── authView.js    → tela de login/cadastro
        ├── sheetView.js   → formulário de novo/editar lançamento
        └── listView.js    → lista principal, saldo, filtros e gestos
```

### Testando localmente
Como o app usa ES Modules (`import`/`export`), abrir o `index.html` direto no
navegador (protocolo `file://`) não funciona em alguns navegadores por causa
de restrições de CORS. Para testar antes de publicar, sirva a pasta com um
servidor estático simples, por exemplo:
```
npx serve .
# ou
python -m http.server 8000
```
e acesse `http://localhost:8000` (ou a porta mostrada). No GitHub Pages
(servido via `https://`) isso não é um problema.
