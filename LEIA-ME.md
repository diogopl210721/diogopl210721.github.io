# DDS Sites & Sistemas

Landing page pronta para GitHub Pages, com arquivos estáticos. Não precisa instalar ferramentas ou contratar uma plataforma para o formulário.

## Abrir

A experiência 3D precisa ser aberta por um endereço HTTP/HTTPS, como a prévia local ou o GitHub Pages. Abrir index.html diretamente com duplo clique exibe a versão leve, pois navegadores restringem módulos 3D em arquivos locais. Para publicar, use todos os arquivos e a pasta vendor na raiz do repositório. O index.html precisa ficar na raiz, e não dentro de uma segunda pasta dds-site.

## Experiência 3D

A rolagem controla cinco cenas: lente DDS, sites e landing pages, sistemas, design e retorno à lente. Anéis e lâminas são objetos tridimensionais, e a câmera atravessa a abertura para revelar os serviços. Os marcadores na base também permitem selecionar uma cena. A lente 3D é uma interpretação da marca; a imagem original aparece no início e no fechamento da sequência.

O botão Reduzir movimento troca a sequência por uma apresentação leve. Essa alternativa também é usada para a preferência de movimento reduzido do dispositivo e quando WebGL não está disponível. Todos os serviços continuam disponíveis abaixo da abertura. A renderização pausa fora da cena e em abas em segundo plano. A experiência é adaptada ao celular; a fluidez depende do dispositivo e do navegador.

O 3D usa Three.js 0.160.1, incluído localmente com sua licença MIT. A sincronização da rolagem foi implementada diretamente, sem dependência externa de animação. Não depende de um serviço de renderização ou assinatura.

## Publicar no GitHub Pages

1. Crie ou escolha o repositório do site no GitHub e envie o conteúdo desta pasta. Inclua CNAME e .nojekyll.
2. Nas configurações do repositório, abra Pages. Use Deploy from a branch, selecione main e a pasta /(root), e salve.
3. Em Custom domain, informe www.xn--ddsinovao-s2a7b.com.br. Este é o formato técnico equivalente ao domínio com acentos informado: www.ddsinovação.com.br. Confira se é exatamente o domínio registrado na sua conta antes de alterar o DNS.
4. No provedor do domínio, configure o registro CNAME de www apontando para SEU-USUARIO.github.io (troque pelo seu usuário real; não inclua o nome do repositório).
5. Aguarde a validação do DNS e do certificado. Ative Enforce HTTPS quando disponível.

O CNAME já incluído ativa o domínio personalizado. Para testar primeiro no endereço padrão do GitHub, retire temporariamente esse arquivo e deixe Custom domain vazio. Não altere registros de e-mail.

Referência oficial: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## Redes sociais

No arquivo config.js, preencha instagram e linkedin com os endereços completos começando por https://. O Instagram @diogo.ctba já está configurado. O espaço do LinkedIn aparece como Em breve até receber o endereço e então vira um link automaticamente. O WhatsApp está configurado como 5541991542931.

## Como funciona o formulário

Pede nome, serviço, uma descrição breve e prazo opcional. Valida os campos, monta uma mensagem e abre o WhatsApp. A pessoa revisa a mensagem e decide enviar. Não há banco de dados nem envio automático. Se a nova aba for bloqueada, aparece um link para abrir a mensagem. A entrega da mensagem depende de a pessoa concluir o envio no WhatsApp.

## Identidade e conteúdo

A logo branca sem fundo enviada pelo usuário é usada no cabeçalho e rodapé. A lente separada enviada pelo usuário é usada na experiência de abertura. A direção visual combina azul, ciano e o espectro colorido da lente. Os projetos ilustrados são conceitos, não trabalhos de clientes; substitua por trabalhos reais quando quiser. Nenhuma marca de outro negócio é citada.

## Arquivos

- index.html: conteúdo e estrutura.
- styles.css: identidade visual, layout responsivo e animações.
- experience.css e experience.js: apresentação 3D, rolagem, cenas e modo leve.
- vendor/: Three.js e sua licença; inclua a pasta na publicação.
- script.js: formulário, seleção de serviços, animações e redes sociais.
- config.js: telefone e links editáveis.
- logo-dds.png: logo do Canva, armazenada localmente sem depender de link temporário.
- lente-dds.png: lente original usada na marca do Canva, armazenada localmente.
- logo-branca.png: logo branca sem fundo fornecida pelo usuário.
- lente-original.png: lente sem fundo fornecida pelo usuário.
- favicon.svg: ícone do site.
- CNAME: domínio personalizado.
- .nojekyll: entrega direta dos arquivos no GitHub Pages.

As fontes DM Sans e Manrope são carregadas do Google Fonts. Se a conexão falhar, o site usa fontes do dispositivo. Os demais recursos visuais estão nos próprios arquivos, sem dependências de imagens remotas. As animações respeitam a preferência de reduzir movimento do dispositivo.

O site foi preparado localmente. Repositório, publicação e DNS não foram alterados.
