/**
 * E2E público #4 (dev/06-estrategia-de-testes.md): senha incorreta não
 * processa.
 */
describe('senha incorreta não processa', () => {
  beforeEach(() => {
    cy.resetWorkshop();
  });

  it('mantém o usuário em T03 com erro inline e sem navegar', () => {
    cy.visit('/login');
    cy.contains('button', 'Entrar').click();
    cy.location('pathname').should('eq', '/app/transferir');

    cy.inputByLabel('Chave PIX do destinatário').type('marina@example.test');
    cy.typeAmount('15000');
    cy.contains('button', 'Continuar').click();
    cy.contains('button', 'Confirmar e pagar').click();

    cy.location('pathname').should('eq', '/app/senha');
    cy.typePassword('000000');
    cy.contains('button', 'Confirmar transação').click();

    cy.contains(
      '.senha-view__error',
      'Informe uma senha transacional válida.',
    ).should('be.visible');
    cy.location('pathname').should('eq', '/app/senha');
  });
});
