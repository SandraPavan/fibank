/**
 * E2E público #1 (dev/06-estrategia-de-testes.md):
 * login → PIX aprovado → comprovante → histórico.
 */
describe('login até histórico com PIX aprovado', () => {
  beforeEach(() => {
    cy.resetWorkshop();
  });

  it('aprova a transferência e a torna visível no comprovante e no histórico', () => {
    cy.visit('/login');
    cy.inputByLabel('E-mail').type('alex@example.test');
    cy.inputByLabel('Senha').type('123456');
    cy.contains('button', 'Entrar').click();
    cy.location('pathname').should('eq', '/app/transferir');

    cy.inputByLabel('Chave PIX do destinatário').type('marina@example.test');
    cy.typeAmount('15000');
    cy.contains('button', 'Continuar').click();

    cy.location('pathname').should('eq', '/app/revisar');
    cy.contains('dd', 'Marina Exemplo').should('be.visible');
    cy.contains('button', 'Confirmar e pagar').click();

    cy.location('pathname').should('eq', '/app/senha');
    cy.typePassword('123456');
    cy.contains('button', 'Confirmar transação').click();

    cy.location('pathname').should('match', /^\/app\/comprovante\//);
    cy.contains('.comprovante-view__details dd', 'Marina Exemplo').should(
      'be.visible',
    );
    cy.contains('.comprovante-view__details', /R\$\s*150,00/).should(
      'be.visible',
    );

    cy.location('pathname').then((pathname) => {
      const transactionId = pathname.split('/').pop() as string;

      cy.contains('a', 'Histórico').click();
      cy.location('pathname').should('eq', '/app/historico');

      cy.inputByLabel('Buscar (ID ou contraparte)').type(transactionId);
      cy.contains('button', 'Aplicar filtros').click();

      cy.contains('.historico-view__row', transactionId).within(() => {
        cy.contains('Aprovada').should('be.visible');
        cy.contains(/R\$\s*150,00/).should('be.visible');
      });
    });
  });
});
