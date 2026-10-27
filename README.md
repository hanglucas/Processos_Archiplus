# Processos Archiplus · GitHub Pages + Supabase

Acesse um link, entre com e-mail/senha e gerencie a base privada da sua equipe. Não há instalação nos computadores dos usuários.

## Configuração inicial — pelo navegador

1. **Supabase:** crie um projeto em https://supabase.com/dashboard. Abra **SQL Editor**, cole todo o arquivo `supabase/schema.sql` e clique em **Run**, uma única vez. Use um projeto novo: o script cria as tabelas e as regras de acesso.
2. **Primeira conta:** em **Authentication → Providers / Sign In → Email**, mantenha e-mail/senha habilitado e desative **Allow new users to sign up**. Em **Authentication → Users → Add user → Create new user**, crie sua conta e senha, confirmando o e-mail pelo painel. Nunca coloque essa senha no repositório. Use senha com pelo menos 10 caracteres. O cadastro de novas contas será feito nesse mesmo painel.
3. **GitHub:** crie um repositório com a branch `main`. Envie **somente o conteúdo da pasta `Processos-Archiplus-GitHub-Pages`**, incluindo `.github/workflows/pages.yml`. Não envie o ZIP inteiro nem o arquivo `IMPORTACAO-PRIVADA-32-PROCESSOS.json`. Pelo navegador, confira se a pasta oculta `.github` foi enviada; se necessário use **Add file → Create new file** com o caminho `.github/workflows/pages.yml` e cole seu conteúdo.
4. No repositório, em **Settings → Secrets and variables → Actions → Variables**, adicione estas duas **Repository variables**:

   | Nome | Valor do painel Supabase → Connect / API Keys |
   |---|---|
   | `VITE_SUPABASE_URL` | URL do projeto, como `https://SEU-ID.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave pública que começa com `sb_publishable_` |

   Em **Settings → Pages → Source**, escolha **GitHub Actions**. Em **Actions → Publicar Processos Archiplus → Run workflow**, execute o deploy. O link aparecerá no job de publicação. Novas alterações em `main` publicam automaticamente.
5. No Supabase, em **Authentication → URL Configuration**, preencha **Site URL** com o endereço exato do Pages, incluindo o nome do repositório e a barra final: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`. Adicione o mesmo endereço em **Redirect URLs**. Abra esse endereço, entre, use **Criar equipe** e, na base vazia, clique em **Selecionar arquivo privado**. Escolha o JSON dos 32 processos que veio separado neste pacote. A importação vai apenas para essa equipe.

Pronto. Para adicionar outra pessoa: crie a conta em Supabase → Authentication → Users; no aplicativo, abra **Usuários**, informe o e-mail e escolha o perfil. A pessoa acessará o mesmo link. Cada usuário pode criar sua própria equipe privada; equipes compartilhadas aparecem apenas para membros autorizados.

Recuperação de senha exige envio de e-mail pelo Supabase. Para usuários reais, configure um provedor SMTP em **Authentication → Email → SMTP Settings**: o remetente de teste do Supabase tem restrições de entrega. Enquanto isso, o administrador pode gerenciar contas pelo painel. O link de recuperação precisa abrir na mesma URL configurada acima.

## O que esta versão inclui

- Login por e-mail/senha; recuperação e troca de senha por link.
- Equipes privadas e troca de equipe; isolamento no banco com Row Level Security (RLS).
- Administrador, editor e leitor; proprietário protegido contra remoção/rebaixamento.
- Cadastro, edição e exclusão de processos SEI, SMU e SEI+SMU; grupos, busca por número/nome/responsável e observações.
- Aprovados, arquivados e reabertura; histórico de gestão com data/autor e registros anteriores preservados no banco.
- Acompanhamento manual, acesso aos portais oficiais, backup JSON privado e atualização da lista a cada 45 segundos ou ao voltar à janela.
- Importação inicial atômica em equipe vazia. O JSON separado contém os 32 cadastros recuperados e os resultados históricos SMU que estavam disponíveis.
- Bloqueio de gravações sobre uma versão antiga, evitando sobrescrever a alteração de outra pessoa.
- Interface responsiva com cores, logotipo, navegação, tabela e formulário recuperados da versão local V5.2.3.

**Consultas automáticas SEI/SMU não estão implementadas neste pacote.** O Pages serve somente arquivos estáticos. Esta versão abre os portais oficiais em outra aba; o CAPTCHA é resolvido diretamente na SMU. O acompanhamento pode ser anotado manualmente e fica salvo no Supabase. Uma futura consulta automática precisa de um backend específico e testes com os portais; não há endpoint fictício ou chave administrativa no frontend.

O ZIP Firebase Web V1 citado na conversa anterior não estava disponível nesta sessão. A interface foi reaproveitada do ZIP V5.2.3 encontrado em Downloads; os 32 processos foram recuperados de `archiplus-restaurar-versao-completa-32-processos.zip`. Não foi possível comparar o resultado com o código do Web V1.

## Privacidade e manutenção

A chave `sb_publishable_` é pública por definição e aparece no site compilado. A segurança depende das regras SQL, que verificam o usuário e sua participação na equipe. **Nunca use `sb_secret_`, `service_role`, senha do banco ou senha de usuário em variáveis `VITE_`, no código ou no repositório.**

As contas são criadas no painel Supabase; nenhum segredo administrativo é necessário no site. Mesmo que o repositório seja público, a base fica no Supabase. O frontend não contém os 32 processos, resultados de consultas ou backups. Guarde o JSON privado e os backups fora do GitHub.

A sessão fica apenas na memória desta aba, sem salvar senha, token ou processos no armazenamento local. Recarregar/fechar a página exige entrar novamente. Para encerrar o uso, clique em **Sair**. As gravações são confirmadas online; não há modo offline. Remover um membro impede novas leituras/gravações e a próxima atualização limpa os dados da tela; não apaga informações que essa pessoa já tenha visto ou exportado.

Backup inclui cadastros e histórico, mas não contas, senhas ou membros. A importação restaura os cadastros em uma equipe vazia e cria novo histórico de importação; não reconstitui os eventos de auditoria originais do backup. Exclusões são definitivas na lista, mantendo o histórico no banco. Para recuperar um cadastro excluído, use um backup anterior ou os registros no painel do banco.

## Desenvolvimento e validação

Node 22.13+ e pnpm 11.25.0 (só para quem desenvolver; o usuário final não instala nada):

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Preencha apenas a URL e a chave pública do Supabase.
pnpm dev
pnpm test
pnpm build
```

O teste executa o SQL em PostgreSQL embarcado (PGlite), simulando três usuários e os papéis anônimo/autenticado. Verifica RLS, permissões, revogação, edição concorrente, exclusão com versão, auditoria e importação de 32 registros em transação. Dados do teste são fictícios e não usam os cadastros privados. O GitHub Actions repete os testes antes da compilação.

O build usa caminhos relativos e funciona em `/nome-do-repositorio/`, raiz ou domínio próprio. Não usa rotas de servidor ou redirecionamento SPA. Se mudar domínio/caminho, atualize as URLs de autenticação no Supabase.

Teste de aceitação após configurar um projeto real: entre com duas contas independentes e confirme bases separadas; compartilhe uma delas como leitor e tente editar; altere para editor e salve; teste recuperação de senha e importe o JSON uma vez. Estes fluxos de autenticação e envio de e-mail precisam do seu projeto Supabase e não foram testados contra uma conta real neste pacote.

Referências oficiais: [GitHub Pages com Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Supabase — email/senha](https://supabase.com/docs/guides/auth/passwords), [chaves públicas e secretas](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
