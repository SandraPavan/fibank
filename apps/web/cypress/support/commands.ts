export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Restaura as fixtures base via `SimulationModule` (DEV-040), o mesmo
       * comando único de reset usado pelo facilitador — garante que cada
       * teste parte de um estado conhecido, independente de ordem.
       */
      resetWorkshop(): Chainable<Cypress.Response<unknown>>;
      /** Localiza o `<input>` associado a um `<label>` de AppInput/AppCurrencyInput. */
      inputByLabel(label: string): Chainable<JQuery<HTMLInputElement>>;
      /**
       * Preenche o campo "Valor (R$)" (AppCurrencyInput) com os dígitos em
       * centavos. Evita `cy.type()` caractere a caractere: o componente
       * reescreve o próprio `value` (com máscara `R$`) a cada tecla, e essa
       * reformatação simultânea confunde o rastreio de cursor do Cypress —
       * definir o valor bruto de uma vez e disparar um único `input`
       * reproduz o mesmo resultado (`digitsToCents`) sem essa corrida.
       */
      typeAmount(rawDigits: string): Chainable<void>;
      /** Digita a senha transacional de 6 dígitos no teclado numérico (AppPinPad). */
      typePassword(password: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('resetWorkshop', () =>
  cy.request('POST', '/api/v1/simulation/reset'),
);

Cypress.Commands.add('inputByLabel', (label: string) =>
  cy.contains('label', label).parent().find('input'),
);

Cypress.Commands.add('typeAmount', (rawDigits: string) => {
  cy.inputByLabel('Valor (R$)').invoke('val', rawDigits).trigger('input');
});

Cypress.Commands.add('typePassword', (password: string) => {
  for (const digit of password) {
    // AppPinPad usa texto estático para '0' (vs. interpolação para '1'-'9'),
    // que o Vue condensa preservando um espaço de cada lado do dígito no
    // `textContent` — \s* tolera isso sem depender de detalhe de compilação.
    cy.get('.app-pin-pad__key')
      .contains(new RegExp(String.raw`^\s*${digit}\s*$`))
      .click();
  }
});
