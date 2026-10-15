# Spec — Loja de extensões do Cairn

Status: **rascunho para decisão**. Nada disto está implementado.
Base: o que o app já tem de configurável (ver "Ponto de partida") e o modelo de
distribuição já usado no updater (assinatura minisign, ver [spec.md](spec.md)).

---

## 1. Objetivo

Permitir que o usuário instale, atualize e remova personalizações do Cairn a partir de uma
loja dentro do próprio app, como as extensões do VS Code: temas, presets de prompt, e depois
comportamentos mais avançados.

**Não-objetivos da primeira versão**
- Executar código de terceiros (fica para uma fase posterior, com sandbox; ver §9).
- Conta de usuário, pagamento ou avaliações.
- Sincronização entre máquinas (o `settings.json` já é o ponto de partida para isso).

---

## 2. Ponto de partida (o que já existe)

| Área | Hoje | Como a extensão se encaixa |
|---|---|---|
| Temas | `src/themes.ts`: `Theme` com `ui: UiColors` e `term: ITheme`, lista fixa de 3 | Tema vira um arquivo de dados que é carregado da pasta de extensões |
| Prompt | `src/promptConfig.ts`: segmentos, estilos, cores por token, ícones | Preset de prompt é um `PromptConfig` serializado |
| Configurações | `settings.json` em `app_config_dir`, com watcher que recarrega ao vivo (`settings_file.rs`) | Lista de extensões ativas e a configuração de cada uma ficam aqui |
| Atualização do app | `tauri-plugin-updater` + `latest.json` assinado com minisign | Mesmo modelo de assinatura e de verificação de versão para a loja |

Hoje nada disso é plugável: os temas e os presets estão no código. O primeiro passo é
tirar essas definições do código e torná-las dados que o app lê de uma pasta.

---

## 3. Tipos de extensão

Dois níveis, em ordem de entrega:

**Nível 1 — declarativo (sem código).** Só dados validados por schema.
- `theme`: paleta da interface e do terminal (mesmo formato de `Theme`).
- `prompt-preset`: um `PromptConfig` pronto (segmentos, estilo, cores).
- `cursor-preset` (opcional): estilo e cor do cursor, como os já configuráveis.

**Nível 2 — com código (fase futura).** Módulos JavaScript que reagem a eventos (comando
terminou, aba aberta) e podem adicionar widgets ao prompt. **Não entra antes** de existir
sandbox e permissões explícitas, porque o código teria acesso ao que o terminal vê (saídas de
comandos, diretório, e nas próximas versões talvez chaves de API).

---

## 4. Formato do pacote

Cada extensão é uma pasta com um manifesto `cairn-extension.json`:

```json
{
  "id": "sthevan.cairn-noite-azul",
  "name": "Noite azul",
  "version": "1.0.0",
  "type": "theme",
  "author": "Sthevan",
  "description": "Paleta escura azul com acentos quentes.",
  "engines": { "cairn": ">=0.7.0" },
  "main": "theme.json",
  "license": "MIT"
}
```

Regras:
- `id` é único e no formato `publicador.nome`, em minúsculas.
- `engines.cairn` é um intervalo semver; a loja não oferece extensão incompatível.
- `main` aponta para o arquivo de dados, validado pelo schema do `type`.
- Sem campos de execução no nível 1. Campo que não está no schema é rejeitado.
- Tamanho máximo do pacote: 256 KB (tema e preset são texto pequeno).

---

## 5. Distribuição

**Índice estático, sem servidor próprio.** Um repositório público (`cairn-extensions`) com:
- `index.json`: lista de extensões com `id`, `version`, `type`, `url` do pacote, `sha256`.
- Os pacotes em si, como arquivos no próprio repo ou em releases.
- `index.json.minisig`: o índice é assinado com uma chave própria da loja.

O app baixa o índice, confere a assinatura com a chave pública embutida, e cada pacote é
conferido pelo `sha256` antes de instalar. Mesmo princípio do updater: sem assinatura válida,
nada é instalado.

Custo: zero de infraestrutura. Quando houver muitas extensões ou publicação por terceiros,
o índice pode migrar para um serviço, mantendo o mesmo formato.

---

## 6. Instalação e armazenamento

- Pasta: `app_config_dir/extensions/<id>/` com o manifesto e os arquivos.
- `settings.json` guarda `extensions: { "<id>": { enabled: boolean, version: string } }`.
- Instalar: baixa, confere o `sha256`, valida o schema, grava na pasta, marca como ativa.
- Desativar: mantém a pasta, tira da lista de ativas (volta sem baixar de novo).
- Remover: apaga a pasta e a entrada no `settings.json`. Nunca apaga nada fora de `extensions/<id>/`.
- Recarga: a mesma recarga ao vivo de `settings.json` já existente faz a extensão valer sem reiniciar.
- Falha de uma extensão nunca impede o app de abrir: extensão inválida é ignorada e reportada.

---

## 7. Interface

Aba **Loja** em Configurações:
- Lista com busca e filtro por tipo (tema, prompt, cursor).
- Cada item mostra nome, autor, versão, descrição e estado (instalada, ativa, atualizável).
- Ações: instalar, ativar/desativar, atualizar, remover.
- Temas: prévia antes de instalar (o `ui` e o `term` aplicados a um bloco de exemplo).
- Atualizações: verificadas ao abrir a loja, como o updater do app. **Não instala sozinho**;
  o usuário escolhe quando atualizar.

---

## 8. Segurança e confiança

- Índice assinado e pacote com `sha256`: sem isso, nada é instalado.
- Nível 1 não executa código: o pior caso de uma extensão maliciosa é um tema feio, mas o
  schema limita o que ela pode dizer (sem URLs, sem caminhos, sem campos fora do schema).
- Validação estrita: campo desconhecido, cor fora de `#rrggbb` ou token, texto longo demais
  (acima de um limite por campo) são rejeitados.
- Extensões de terceiros, quando existirem, mostram aviso de que não foram revisadas.
- Nível 2 só com permissões declaradas e aprovadas pelo usuário na instalação, e sandbox.

---

## 9. Entregas

| Marco | Entrega | Critério de pronto |
|---|---|---|
| M1 | Temas e presets saem do código e viram arquivos lidos da pasta de extensões | Os 3 temas atuais funcionam como extensões locais, sem mudar o visual |
| M2 | Validação de schema e manifesto | Pacote inválido é rejeitado com mensagem clara, app continua abrindo |
| M3 | Índice assinado e aba Loja: instalar, ativar, desativar, remover | Instala um tema do índice de teste e remove sem sobrar arquivo |
| M4 | Atualização de extensões e prévia de tema | Atualização aparece na aba; nada é trocado sem o usuário pedir |
| M5 (futuro) | Nível 2 com sandbox e permissões | Decisão separada, só depois de M1–M4 em uso |

---

## 10. Decisões em aberto

1. **Nível 2 (código) entra na roadmap?** Recomendação: decidir só depois de M4. Código de
   terceiros com acesso ao terminal é o maior risco do projeto.
2. **Quem publica?** Recomendação: começar só com extensões oficiais do Sthevan, e abrir
   publicação de terceiros com revisão manual.
3. **Chave de assinatura da loja.** Recomendação: chave própria (como as do updater de
   FocusBrew, Pacer e Cairn), guardada fora do repo, com senha no gerenciador.
4. **Licença das extensões oficiais.** Precisa ser escolhida antes de publicar o índice.

---

## 11. Riscos

- **Extensão maliciosa** pelo canal de terceiros: mitigado por nível 1 declarativo e revisão.
- **Chave de assinatura vazar**: mesmo problema já visto com o updater; a senha da chave da
  FocusBrew apareceu no chat e precisa ser trocada. Mesma disciplina aqui.
- **Quebra entre versões do app**: mitigado pelo campo `engines.cairn`.
- **Escopo grande**: por isso a divisão em marcos, e M1 sem nenhuma parte de rede.
