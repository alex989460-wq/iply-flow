# Super Gestor para Android

Este repositório contém o aplicativo Android nativo do Super Gestor, preparado com Capacitor para abrir no Android Studio e gerar o arquivo AAB da Google Play Store.

## Requisitos

- Android Studio atualizado, com Android SDK instalado
- JDK 21 (a versão incluída no Android Studio pode ser usada)
- Node.js 20 ou superior
- Git

## Abrir o projeto pela primeira vez

```bash
npm install
npm run android:sync
npm run android:open
```

O último comando abre a pasta `android` no Android Studio. Aguarde a sincronização do Gradle terminar e execute em um emulador ou celular conectado.

## Atualizar depois de baixar novas alterações

Depois de cada `git pull`, execute:

```bash
npm install
npx cap sync android
```

Como o aplicativo abre `https://supergestor.top`, as melhorias publicadas no sistema aparecem no aplicativo sem exigir uma nova versão na loja. Uma nova versão será necessária quando houver mudanças no projeto Android, permissões, ícone, notificações ou outros recursos nativos.

## Gerar o AAB da Play Store

1. Abra o projeto no Android Studio com `npm run android:open`.
2. No menu, escolha **Build > Generate Signed App Bundle or APK**.
3. Selecione **Android App Bundle**.
4. Crie um novo arquivo de assinatura (`.jks`) e guarde-o junto com as senhas em local seguro.
5. Selecione a variante **release** e conclua.
6. O Android Studio gera o arquivo em `android/app/release/` ou `android/app/build/outputs/bundle/release/`.

Nunca envie o arquivo `.jks`, suas senhas ou o arquivo `key.properties` para um repositório público.

## Cadastro na Play Store

- Nome do aplicativo: **Super Gestor**
- Identificador: **com.supergestor.app**
- Categoria sugerida: **Produtividade** ou **Negócios**
- É obrigatório preencher a ficha de segurança de dados e fornecer uma política de privacidade pública.
- O primeiro envio deve ser feito como AAB assinado.

## Notificações

O projeto já inclui a integração do OneSignal. Ao entrar no aplicativo, o usuário pode permitir notificações. Antes da publicação, confirme no OneSignal que existe um aplicativo Android com o mesmo identificador `com.supergestor.app` e que a configuração do Firebase está ativa.

## Teste em celular por cabo USB

Ative as opções do desenvolvedor e a depuração USB no Android. Depois execute:

```bash
npm run android:run
```

Também é possível usar o botão **Run** do Android Studio.