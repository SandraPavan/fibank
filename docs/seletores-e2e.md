# Seletores E2E com `data-testid`

Guia para criar e usar `data-testid` no frontend (`apps/web`), introduzido na
DEV-035. A convenção resumida está em
[`dev/06-estrategia-de-testes.md`](../../dev/06-estrategia-de-testes.md)
("Seletores E2E"); este documento explica como gerar os próximos.

## Por que usar

Texto visível, classes CSS e estrutura do DOM mudam por motivos de produto ou
de layout, e testes que dependem deles quebram sem que o comportamento tenha
mudado. O `data-testid` existe só para a automação: é um contrato estável entre
a tela e o teste.

```ts
// frágil: quebra se o texto ou a classe mudar
cy.contains('button', 'Confirmar e pagar').click();
cy.get('.app-pin-pad__key').contains('7').click();

// estável
cy.getByTestId('revisar-confirmar-button').click();
cy.getByTestId('pin-pad-key-7').click();
```

## Convenção de nome

```
<tela>-<elemento>[-<tipo>]
```

- tudo em **kebab-case**, sem acentos;
- `<tela>` e `<elemento>` em **português**, como o restante da UI;
- `<tipo>` em inglês, só para elementos interativos.

### Prefixos de tela

| Prefixo       | Onde                                 |
| ------------- | ------------------------------------ |
| `login`       | `LoginView.vue`                      |
| `transferir`  | `TransferirView.vue` (T01)           |
| `revisar`     | `RevisarView.vue` (T02)              |
| `senha`       | `SenhaView.vue` (T03)                |
| `comprovante` | `ComprovanteView.vue` (T04)          |
| `erro`        | `ErroView.vue` (T05)                 |
| `historico`   | `HistoricoView.vue` (T06)            |
| `nav`         | links do menu em `AppShell.vue`      |
| `pin-pad`     | componente `AppPinPad.vue` (interno) |

Ao criar uma tela nova, use o nome da view sem o sufixo `View`, em
minúsculas: `PerfilView.vue` → `perfil-`.

### Sufixos de tipo

| Sufixo     | Elemento                                  | Exemplo                       |
| ---------- | ----------------------------------------- | ----------------------------- |
| `-input`   | `<input>`, `AppInput`, `AppCurrencyInput` | `login-email-input`           |
| `-select`  | `<select>`                                | `historico-status-select`     |
| `-button`  | `<button>`, `AppButton`                   | `transferir-continuar-button` |
| `-toggle`  | botão que abre/fecha conteúdo             | `erro-detalhes-toggle`        |
| `-card`    | contêiner principal da tela (`AppCard`)   | `senha-card`                  |
| _(nenhum)_ | texto exibido, mensagem, lista, bloco     | `revisar-nome`, `senha-erro`  |

### Itens repetidos (listas)

Use um **identificador de domínio** estável, nunca o índice do `v-for`:

```vue
<li
  v-for="item in items"
  :key="item.transactionId"
  :data-testid="`historico-item-${item.transactionId}`"
></li>
```

O índice muda quando a ordenação, filtro ou paginação muda; o ID não.

## Como adicionar em uma tela

### 1. Elemento HTML ou componente cujo elemento raiz é o alvo

Basta o atributo. Componentes como `AppButton`, `AppCard` e `StatusPill`
repassam atributos ao elemento raiz (fallthrough do Vue):

```vue
<AppButton data-testid="revisar-confirmar-button" @click="handleConfirm">
  Confirmar e pagar
</AppButton>

<p v-if="store.confirmError" role="alert" data-testid="senha-erro">
  {{ store.confirmError }}
</p>
```

### 2. Campos de formulário do design system

`AppInput` e `AppCurrencyInput` têm um `<div>` como raiz. Um `data-testid`
passado direto cairia no `<div>`, e `cy.type()` falharia. Use a prop
**`test-id`**, que o componente aplica no `<input>`:

```vue
<AppInput v-model="email" label="E-mail" test-id="login-email-input" />
<AppCurrencyInput
  v-model="amount"
  label="Valor (R$)"
  test-id="transferir-valor-input"
/>
```

## Como criar um componente novo

Pergunta-chave: **o elemento com que o teste interage é a raiz do template?**

- **Sim** (ex.: um botão): nada a fazer, o fallthrough já resolve.
- **Não** (ex.: wrapper `<div>` com `<label>` + `<input>`): siga o padrão do
  `AppInput.vue`, com uma prop opcional aplicada no elemento interno:

```vue
<script setup lang="ts">
defineProps<{
  label: string;
  /** Aplicado no `<input>` (não no wrapper) para seletores E2E. */
  testId?: string;
}>();
</script>

<template>
  <div class="app-novo-campo">
    <label>{{ label }}</label>
    <input :data-testid="testId" />
  </div>
</template>
```

- **Componente com partes internas fixas** (ex.: teclado): defina os IDs dentro
  do próprio componente com o prefixo dele, como no `AppPinPad.vue`
  (`pin-pad-key-<dígito>`, `pin-pad-backspace`). Isso só funciona se o
  componente aparecer **uma vez por tela**; se puder repetir, aceite um prefixo
  por prop.

Inclua um teste no
[`design-system.spec.ts`](../apps/web/test/components/design-system.spec.ts)
confirmando que o `data-testid` está no elemento certo (veja os casos de
`AppInput` e `AppPinPad` existentes).

## Como usar no Cypress

O comando `cy.getByTestId()` está em
[`cypress/support/commands.ts`](../apps/web/cypress/support/commands.ts):

```ts
cy.getByTestId('login-email-input').type('alex@example.test');
cy.getByTestId('login-entrar-button').click();
cy.getByTestId('comprovante-valor').should('contain.text', '150,00');
cy.getByTestId(`historico-item-${transactionId}`).should('be.visible');
```

Para validar **texto que o usuário lê**, combine: localize pelo `data-testid` e
verifique o conteúdo com `should('contain.text', ...)`. Assim o teste continua
garantindo o que aparece na tela, sem depender dele para encontrar o elemento.

## Checklist ao adicionar um `data-testid`

- [ ] segue `<tela>-<elemento>[-<tipo>]`, em kebab-case e sem acentos;
- [ ] está no elemento **interativo** (para campos do design system, via `test-id`);
- [ ] é único na tela; em listas, usa ID de domínio, não índice;
- [ ] não contém dado variável de negócio (nome, valor, data);
- [ ] não é usado para estilo nem lógica (CSS e JS continuam usando classes/refs);
- [ ] não renomeia nem remove um ID existente sem atualizar os specs que o usam.

Para listar os IDs já existentes e evitar duplicidade:

```sh
grep -rhoE '(data-testid|test-id)="[^"]+"' apps/web/src | sort
```

## Catálogo atual (DEV-035)

| Tela        | IDs                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Navegação   | `nav-transferir`, `nav-historico`, `nav-relatorios`                                                                                                                                                                                                                                                                                                                                              |
| Login       | `login-card`, `login-email-input`, `login-senha-input`, `login-entrar-button`                                                                                                                                                                                                                                                                                                                    |
| Transferir  | `transferir-card`, `transferir-saldo`, `transferir-chave-input`, `transferir-destinatario-selecionado`, `transferir-valor-input`, `transferir-descricao-input`, `transferir-erro`, `transferir-continuar-button`, `transferir-contato-<recipientId>`                                                                                                                                             |
| Revisar     | `revisar-card`, `revisar-nome`, `revisar-instituicao`, `revisar-documento`, `revisar-chave`, `revisar-valor`, `revisar-descricao`, `revisar-editar-button`, `revisar-confirmar-button`                                                                                                                                                                                                           |
| Senha       | `senha-card`, `senha-favorecido`, `senha-valor`, `senha-erro`, `senha-em-analise`, `senha-cancelar-button`, `senha-confirmar-button`, `pin-pad-dots`, `pin-pad-key-0`…`pin-pad-key-9`, `pin-pad-backspace`                                                                                                                                                                                       |
| Comprovante | `comprovante-card`, `comprovante-favorecido`, `comprovante-instituicao`, `comprovante-chave`, `comprovante-valor`, `comprovante-data`, `comprovante-id`, `comprovante-descricao`                                                                                                                                                                                                                 |
| Erro        | `erro-card`, `erro-detalhes-toggle`, `erro-detalhes`, `erro-voltar-button`, `erro-tentar-novamente-button`                                                                                                                                                                                                                                                                                       |
| Histórico   | `historico-card`, `historico-atencao`, `historico-busca-input`, `historico-status-select`, `historico-tipo-select`, `historico-de-input`, `historico-ate-input`, `historico-limpar-button`, `historico-aplicar-button`, `historico-erro`, `historico-vazio`, `historico-lista`, `historico-item-<transactionId>`, `historico-paginacao`, `historico-anterior-button`, `historico-proxima-button` |

Ainda sem `data-testid` (fora do escopo da DEV-035): `FacilitatorView`,
`RelatoriosView` e `JoinView`. Os specs Cypress existentes também ainda usam
os seletores antigos; a migração é opcional e pode ser feita aos poucos.
