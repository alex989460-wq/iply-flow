# Corrigir instalador do agente no Windows

## Alterações
- Localizar o Python instalado pelo executável real, sem depender do PATH do PowerShell.
- Aceitar instalações via `py`, pasta do usuário e pastas padrão do Windows.
- Usar o caminho encontrado na instalação dos pacotes e na abertura do agente.
- Interromper antes do túnel com uma mensagem clara caso o Python realmente não seja encontrado.
- Publicar o instalador corrigido no `supergestor.top` e validar o arquivo servido.

## Verificação
- Confirmar que o script não chama mais o comando genérico `python`.
- Confirmar que a versão publicada contém a nova localização automática.