/**
 * E2E público #2 (dev/06-estrategia-de-testes.md): valor inválido não avança.
 */
describe('valor inválido não avança', () => {
  beforeEach(() => {
    cy.resetWorkshop();
  });

  it('mantém o usuário em T01 e mostra o erro quando o valor é zero', () => {
    cy.visit('/login');
    cy.contains('button', 'Entrar').click();
    cy.location('pathname').should('eq', '/app/transferir');

    cy.inputByLabel('Chave PIX do destinatário').type('marina@example.test');
    cy.contains('button', 'Continuar').click();

    cy.contains(
      '.transferir-view__error',
      'Informe um valor maior que zero.',
    ).should('be.visible');
    cy.location('pathname').should('eq', '/app/transferir');
  });
});
