# Pátio Repasses — como colocar no ar no Netlify

## O que tem aqui

```
public/index.html                 o site (vitrine + área do lojista)
netlify/functions/placa.mjs       consulta a placa na sua API (a chave fica escondida no servidor)
netlify/functions/repasses.mjs    salva e lista os anúncios (banco Netlify Blobs, já incluso no Netlify)
netlify/functions/lojistas.mjs    cadastro de lojistas (só o administrador)
netlify/functions/login.mjs       login de administrador, equipe e lojistas
netlify/functions/admin.mjs       painel master: equipe, configurações e histórico
netlify/functions/reservas.mjs    reservas com sinal (comissão do Pátio)
netlify/functions/fotos.mjs       fotos dos anúncios (guardadas no Netlify Blobs)
netlify/lib/placa-api.mjs         chamada à API de placa (APIBrasil, Placa Fipe ou outra)
netlify/lib/core.mjs              senhas, sessões e banco
netlify.toml / package.json       configuração
```

## 1. Subir o projeto

O site tem funções de servidor, então **não funciona arrastando a pasta** no Netlify Drop. Use um destes jeitos:

**Pelo GitHub (recomendado):** crie um repositório, envie esta pasta, e no Netlify clique em
*Add new site → Import an existing project* e escolha o repositório. Não precisa mudar nada nas configurações de build.

**Pelo terminal:**
```
npm install
npx netlify-cli login
npx netlify-cli deploy --prod
```

## 2. Configurar as variáveis

No Netlify: *Site configuration → Environment variables → Add a variable*

| Variável | O que colocar |
|---|---|
| `ADMIN_PASSWORD` | A **sua** senha de administrador. Você entra com o usuário `admin` e essa senha |
| `CONTATO_WHATSAPP` | Seu WhatsApp, ex.: `(48) 99999-0000`. Aparece no botão "Quero ser parceiro" do site |
| `SESSION_SECRET` | Opcional. Um texto longo e aleatório que protege os logins. Se não colocar, o site usa a senha de admin |
| `PIX_CHAVE` | Sua chave Pix para receber os sinais (CNPJ, e-mail, telefone ou aleatória) |
| `PIX_NOME` | Nome do favorecido que aparece para o cliente, ex.: `Pátio Repasses` |
| `GRUPO_WHATSAPP` | Link de convite do seu grupo, ex.: `https://chat.whatsapp.com/...`. Aparece no aviso de boas-vindas |
| `TAXA_CHEIA` | Opcional. Valor do sinal em reais. Padrão: `1900` |
| `TAXA_PROMO` | Opcional. Valor do sinal na promoção. Padrão: `1000` |
| `PROMO_ATE` | Opcional. Último dia da promoção (AAAA-MM-DD). Padrão: `2026-11-22` |
| `PLACA_API_URL` | Endereço da consulta da sua API, com `{placa}` onde vai a placa e `{token}` onde vai a chave, se for na URL |
| `PLACA_API_TOKEN` | Sua chave da API de placas |
| `PLACA_API_HEADER` | Só se a sua API pede a chave num cabeçalho (ex.: `Authorization` ou `x-api-key`). Se for na URL, deixe sem |
| `PLACA_CACHE_DIAS` | Opcional. Dias que uma placa já consultada fica guardada sem gastar crédito. Padrão: 30 |

Placa Fipe (placafipe.com.br), a API usada pelo Pátio. Preencha em **Configurações → Consulta de placa**:
- Endereço da API: `https://api.placafipe.com.br/getplacafipe/{placa}/{token}`
- Chave (token): o token do seu plano
- Cabeçalho da chave: deixe vazio

Outros exemplos de `PLACA_API_URL`:
- WDAPI: `https://wdapi2.com.br/consulta/{placa}/{token}`
- API que recebe a chave no cabeçalho: `https://api.exemplo.com.br/v1/placa/{placa}` + `PLACA_API_HEADER=Authorization` e `PLACA_API_TOKEN=Bearer SUA_CHAVE`

Depois de salvar as variáveis, faça um novo deploy (*Deploys → Trigger deploy*).

## Painel master (usuário `admin`)

Tudo que antes ficava nas variáveis do Netlify agora pode ser mudado no próprio site, aba **Configurações**:
WhatsApp do Pátio, link do grupo, chave Pix, valor do sinal e da promoção, aviso de boas-vindas e API de placa.
O que for salvo no painel vale mais que a variável do Netlify. As variáveis continuam servindo como valor inicial.

Aba **Acessos**:
- **Criar acesso da equipe**: nome + o que a pessoa pode ver (Reservas, Repasses, Lojistas, Configurações, Acessos).
  O sistema gera usuário e senha. Exemplo: uma atendente só com **Reservas** confirma Pix e não vê mais nada.
- **Gerar nova senha** e **Desativar** derrubam o acesso da pessoa na hora.
- **Atividade recente**: quem entrou, confirmou Pix, cadastrou loja, mudou configuração (últimos 300 eventos).
- Só o master pode dar a permissão de Acessos para alguém.

**Senha master**: troque pelo botão **Trocar senha** no topo do painel. Depois disso, a `ADMIN_PASSWORD` do Netlify deixa de valer.

**Esqueceu a senha master?**
1. No Netlify, em Environment variables, crie `ADMIN_RESET` com o valor `1` e faça um novo deploy.
2. Entre com o usuário `admin` e a senha que está na `ADMIN_PASSWORD`.
3. Apague a variável `ADMIN_RESET` e faça outro deploy. A senha do Netlify continua valendo até você trocar de novo no painel.

**Lojista ou equipe esqueceu a senha?** No login tem o link "Esqueci minha senha", que abre o seu WhatsApp. Você gera uma nova em Lojistas ou Acessos.

## 3. Cadastrar lojistas

1. Abra o site, clique em **Anunciar** e entre com usuário `admin` e a sua `ADMIN_PASSWORD`.
2. Vá na aba **Lojistas** e preencha nome da loja, responsável, WhatsApp e cidade.
3. O sistema cria o usuário (pelo nome da loja) e uma senha. Clique em **Enviar no WhatsApp**: a mensagem já vai pronta com o site, o usuário e a senha.
4. A senha só aparece nessa hora. Se a loja perder, clique em **Gerar nova senha** (a antiga para de funcionar).
5. **Desativar** tira a loja do ar na hora: ela não entra mais e os carros dela somem da vitrine. **Reativar** traz tudo de volta.

## 4. Como o lojista usa

1. Entra em **Anunciar** com o usuário e a senha que recebeu (pode trocar a senha depois).
2. Digita a placa e clica em **Buscar dados**: marca, modelo, versão, ano, cor, combustível e FIPE são preenchidos.
3. Completa km e preço e salva. O carro aparece na vitrine com o nome, a cidade e o WhatsApp da loja.
4. Ele só vê e mexe nos carros da própria loja. Você, como admin, vê e edita todos e pode anunciar em nome de qualquer loja.

Se a consulta falhar, veja *Logs → Functions → placa* no Netlify: a resposta da API aparece lá.
Me mande esse trecho que eu ajusto a leitura para o formato exato da sua API.

## 5. Reservas com sinal (comissão do Pátio)

1. Na vitrine, o cliente clica em **Reservar com sinal**, preenche nome e WhatsApp e aceita as condições.
2. O site mostra o valor do sinal (R$ 1.000 na promoção, R$ 1.900 depois), sua chave Pix e um código da reserva (ex.: PR-Z39RV). O botão **Enviar comprovante** abre o seu WhatsApp com a mensagem pronta.
3. No painel, aba **Reservas**, o pedido aparece em **Aguardando Pix**. Quando o Pix cair, clique em **Pix recebido** e confirme.
4. O carro vira **Reservado** na vitrine e o lojista vê o contato do cliente na aba **Reservas** dele, para fechar o negócio.
5. **Cancelar reserva** devolve o carro para Disponível. O lojista nunca vê o valor da comissão.
6. A vitrine não mostra o WhatsApp das lojas, para a negociação passar pelo Pátio.

## Fotos

- No cadastro do carro, em **Fotos**, toque em **Adicionar fotos** (no celular abre a câmera ou a galeria). Até 10 por carro.
- O site reduz cada foto antes de enviar (grande com 1600 px e miniatura com 560 px), então funciona bem no 4G.
- Use **‹ ›** para mudar a ordem. A primeira foto é a **capa** da vitrine. **✕** remove.
- Na vitrine, clicar na foto abre a galeria (setas, teclado ou arrastar com o dedo).
- Uma loja não consegue usar nem apagar fotos de outra. Excluir o anúncio apaga as fotos dele.

## Segurança

- A chave da API nunca vai para o navegador.
- Só lojistas cadastrados e você conseguem consultar placa, então ninguém de fora gasta seus créditos.
- As senhas dos lojistas são guardadas embaralhadas (nem você consegue ver a senha antiga, só gerar outra).
- Consultas repetidas da mesma placa usam o cache, sem cobrar de novo.
- A vitrine pública mostra só o final da placa.
