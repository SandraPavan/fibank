### Objetivo

Garantir que o sistema aceite uma solicitação com dados válidos e rejeite solicitações que violem as regras básicas de entrada.

### Técnicas CTFL utilizadas

- **Particionamento de Equivalência (EP)**
- **Análise de Valor Limite (BVA)**
- **Suposição de Erro**

O CTFL classifica EP e BVA como técnicas caixa-preta e Suposição de Erro como técnica baseada em experiência.

### Tipo de teste

**Funcional**

### Nível

**API**

> Podemos futuramente ter cenários equivalentes para UI, mas nesta primeira suíte vamos manter o foco no serviço, já que o objeto de teste do workshop é o serviço de realização de PIX e seu mecanismo simplificado de antifraude.

```
# language: pt

@feature-pix-validacao
Funcionalidade: Validar solicitação de PIX
  Como cliente do FinBank
  Quero enviar uma solicitação de PIX com dados válidos
  Para que o sistema possa processar minha operação com segurança

  Contexto:
    Dado que a conta "ACC-1001" está ativa
    E que a chave PIX "11999999999" é válida
    E que o dispositivo "DEV-9988" está disponível
    E que existe saldo suficiente para a operação

  @CT01 @RF01 @EP @funcional @api @baseline
  Cenário: Aceitar uma solicitação de PIX com dados válidos
    Quando eu solicitar um PIX com os seguintes dados:
      | campo        | valor                  |
      | accountId    | ACC-1001               |
      | recipientKey | 11999999999            |
      | amount       | 1000.00                |
      | timestamp    | 2026-08-18T14:32:00-03:00 |
      | deviceId     | DEV-9988               |
    Então a solicitação deve ser aceita para processamento
    E nenhuma regra de validação deve ser violada
    E a resposta deve conter um "requestId" gerado para a intenção

  @CT02 @RF01 @BVA @funcional @api @baseline
  Cenário: Rejeitar uma solicitação de PIX com valor igual a zero
    Quando eu solicitar um PIX no valor de "0.00" reais
    Então a solicitação deve ser rejeitada
    E a resposta deve identificar a regra de valor inválido
    E nenhuma transação deve ser criada

  @CT03 @RF01 @BVA @funcional @api @baseline
  Cenário: Aceitar uma solicitação de PIX com valor imediatamente acima de zero
    Quando eu solicitar um PIX no valor de "0.01" reais
    Então a solicitação deve ser aceita para processamento
    E nenhuma regra de validação deve ser violada
    E a resposta deve conter o "requestId" da solicitação

  @CT04 @RF01 @EP @funcional @api @baseline
  Cenário: Rejeitar uma solicitação de PIX com valor negativo
    Quando eu solicitar um PIX no valor de "-100.00" reais
    Então a solicitação deve ser rejeitada
    E a resposta deve identificar a regra de valor inválido
    E nenhuma transação deve ser criada

  @CT05 @RF01 @EP @funcional @api @baseline
  Esquema do Cenário: Rejeitar uma solicitação quando um campo obrigatório não for informado
    Quando eu solicitar um PIX sem informar o campo "<campo>"
    Então a solicitação deve ser rejeitada
    E a resposta deve identificar o campo "<campo>" como inválido
    E nenhuma transação deve ser criada

    Exemplos:
      | campo        |
      | accountId    |
      | recipientKey |
      | amount       |
      | timestamp    |
      | deviceId     |

  @CT06 @RF01 @EP @funcional @api @baseline
  Cenário: Rejeitar uma solicitação com chave PIX inválida
    Quando eu solicitar um PIX utilizando a chave PIX "chave-invalida"
    Então a solicitação deve ser rejeitada
    E a resposta deve identificar a chave PIX como inválida
    E nenhuma transação deve ser criada

  @CT07 @RF01 @EP @funcional @api @baseline
  Cenário: Rejeitar uma solicitação com data inválida
    Quando eu solicitar um PIX com uma data inválida
    Então a solicitação deve ser rejeitada
    E a resposta deve identificar a data como inválida
    E nenhuma transação deve ser criada
```
