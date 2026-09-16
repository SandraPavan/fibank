/**
 * E2E público #3 (dev/06-estrategia-de-testes.md): valor alto entra em
 * análise. R$ 6.000,00 fica acima do limiar de revisão (R$ 5.000,00 —
 * pix-risk.config) e dentro do saldo/limite diário do perfil base, então
 * só a regra de valor isolado se aplica (RISK-01/D01 não fazem parte
 * desta suíte pública).
 */
describe('valor alto entra em análise', () => {
  beforeEach(() => {
    cy.resetWorkshop();
  });

  it('mantém o usuário em T03 com aviso de análise ao confirmar valor acima do limiar', () => {
    cy.visit('/login');
    cy.contains('button', 'Entrar').click();
    cy.location('pathname').should('eq', '/app/transferir');

    cy.inputByLabel('Chave PIX do destinatário').type('marina@example.test');
    cy.typeAmount('600000');
    cy.contains('button', 'Continuar').click();

    cy.location('pathname').should('eq', '/app/revisar');
    cy.contains('button', 'Confirmar e pagar').click();

    cy.location('pathname').should('eq', '/app/senha');
    cy.typePassword('123456');
    cy.contains('button', 'Confirmar transação').click();

    cy.contains('.senha-view__review', 'Operação em análise').should(
      'be.visible',
    );
    cy.location('pathname').should('eq', '/app/senha');
  });
});
