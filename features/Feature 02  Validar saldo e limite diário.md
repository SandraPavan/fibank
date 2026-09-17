## 1. Objetivo

Garantir que uma solicitação de PIX seja permitida ou rejeitada de acordo com:

- saldo disponível;
- soma das transações aprovadas no mesmo dia;
- limite diário configurado.

### Técnicas CTFL

Vamos usar:

- **Particionamento de Equivalência**
- **Análise de Valor Limite**

Aqui a BVA fica especialmente interessante porque temos **dois limites diferentes**:

```
              SALDO
                │
        ┌───────┴───────┐
        │               │
   suficiente       insuficiente
```

e:

```
          LIMITE DIÁRIO
                │
        ┌───────┼───────┐
        │       │       │
      abaixo   igual   acima
```

O material CTFL mostra justamente a necessidade de considerar o valor limite e seus vizinhos quando aplicamos BVA.

---

# 2. O que precisamos decidir antes

Existe uma informação que **não está definida nas fontes**: o valor numérico do limite diário da conta de teste.

O PRD diz apenas:

> "limite configurado"

e exige que o comportamento no limite seja definido e testado.

Portanto, **não vou inventar R$ 10.000, R$ 20.000 etc.**

Vamos trabalhar inicialmente com uma fixture conceitual:

```
limiteDiario = LIMITE_DIARIO
```

Quando definirmos os dados de seed do FinBank, substituímos por um valor concreto.

Isso é melhor para o workshop porque a regra de negócio fica explícita e rastreável.

```
# language: pt

@feature-saldo-limite
Funcionalidade: Validar saldo e limite diário do PIX
  Como cliente do FinBank
  Quero realizar um PIX respeitando meu saldo e meu limite diário
  Para que uma operação não seja processada além dos recursos disponíveis

  Contexto:
    Dado que a conta "ACC-1001" está ativa
    E que a chave PIX "11999999999" é válida
    E que o dispositivo "DEV-9988" é conhecido
    E que a data da operação é "2026-08-18"
```

# CT08 | Saldo suficiente

Esse será nosso cenário de **partição válida**.

```
  @CT08 @RF02 @EP @funcional @api @baseline
  Cenário: Permitir PIX quando o saldo disponível é suficiente
    Dado que a conta possui saldo disponível de "5000.00" reais
    E que a soma das transações aprovadas no dia não atingiu o limite diário
    Quando eu solicitar um PIX de "1000.00" reais
    Então a validação de saldo deve ser aprovada
    E a operação deve seguir para as próximas regras de processamento
```

### Por que esse caso?

Estamos representando a partição:

```
valor do PIX <= saldo disponível
```

O sistema não deve bloquear a operação por insuficiência de saldo.

**Resultado baseline:** 🟢 PASS

---

# CT09 | Saldo insuficiente

Agora a partição inválida.

```
  @CT09 @RF02 @EP @funcional @api @baseline
  Cenário: Rejeitar PIX quando o saldo disponível é insuficiente
    Dado que a conta possui saldo disponível de "500.00" reais
    E que a soma das transações aprovadas no dia não atingiu o limite diário
    Quando eu solicitar um PIX de "1000.00" reais
    Então a solicitação deve ser rejeitada
    E a resposta deve possuir o código de motivo "INSUFFICIENT_BALANCE"
    E nenhuma transação deve ser criada
```

O código `INSUFFICIENT_BALANCE` está explicitamente definido no fluxo F02.

**Resultado baseline:** 🟢 PASS

---

# CT10 | PIX exatamente no saldo disponível

Aqui entra BVA.

```
  @CT10 @RF02 @BVA @funcional @api @baseline
  Cenário: Permitir PIX quando o valor é exatamente igual ao saldo disponível
    Dado que a conta possui saldo disponível de "1000.00" reais
    E que a soma das transações aprovadas no dia não atingiu o limite diário
    Quando eu solicitar um PIX de "1000.00" reais
    Então a validação de saldo deve ser aprovada
    E a operação deve seguir para as próximas regras de processamento
```

Estamos testando:

```
saldo = valor da operação
```

Isso é importante porque queremos saber explicitamente qual é o comportamento **na fronteira**.

**Resultado baseline:** 🟢 PASS

---

# CT11 | PIX imediatamente acima do saldo

```
  @CT11 @RF02 @BVA @funcional @api @baseline
  Cenário: Rejeitar PIX quando o valor excede o saldo disponível
    Dado que a conta possui saldo disponível de "1000.00" reais
    E que a soma das transações aprovadas no dia não atingiu o limite diário
    Quando eu solicitar um PIX de "1000.01" reais
    Então a solicitação deve ser rejeitada
    E a resposta deve possuir o código de motivo "INSUFFICIENT_BALANCE"
    E nenhuma transação deve ser criada
```

Agora temos:

```
999,99  → válido
1.000,00 → limite
1.000,01 → inválido
```

Não precisamos necessariamente manter `999,99` se nossa estratégia de BVA escolhida não exigir esse vizinho. O importante é que **a fronteira foi identificada e testada**.

---

# 4. Agora o segundo limite: limite diário

Aqui começa a ficar mais interessante.

Precisamos separar:

> saldo disponível

de:

> quanto já foi utilizado do limite diário.

São duas condições diferentes.

---

# CT12 | Limite diário ainda disponível

```
  @CT12 @RF02 @EP @funcional @api @baseline
  Cenário: Permitir PIX quando a soma diária permanece abaixo do limite
    Dado que a conta possui saldo disponível de "10000.00" reais
    E que a conta possui limite diário configurado de "LIMITE_DIARIO" reais
    E que a soma das transações aprovadas no dia está abaixo do limite diário
    Quando eu solicitar um PIX que não ultrapasse o limite diário
    Então a validação do limite diário deve ser aprovada
    E a operação deve seguir para as próximas regras de processamento
```

Aqui não precisamos ainda colocar um número inventado.

---

# CT13 | Limite diário exatamente atingido

Esse é obrigatório pelo RF-02.

```
  @CT13 @RF02 @BVA @funcional @api @baseline
  Cenário: Avaliar PIX quando a soma diária atinge exatamente o limite
    Dado que a conta possui saldo disponível suficiente
    E que o limite diário configurado é de "LIMITE_DIARIO" reais
    E que a soma das transações aprovadas no dia é de
      "LIMITE_DIARIO_MENOS_VALOR_PIX" reais
    Quando eu solicitar um PIX de "VALOR_PIX" reais
    Então a soma das transações aprovadas deve atingir exatamente o limite diário
    E o resultado deve seguir a regra configurada para a igualdade no limite diário
```

**Aqui existe uma decisão de negócio que precisamos registrar:**

> O que acontece quando a soma diária fica **exatamente igual** ao limite?

O PRD exige que esse comportamento seja definido e testado, mas não fornece a resposta.

Então, até definirmos isso, o Gherkin deve deixar a intenção clara sem inventar o resultado.

---

# CT14 | Limite diário excedido

```
  @CT14 @RF02 @BVA @funcional @api @baseline
  Cenário: Rejeitar PIX quando a soma diária excede o limite
    Dado que a conta possui saldo disponível suficiente
    E que a soma das transações aprovadas no dia está próxima do limite diário
    Quando eu solicitar um PIX que faça a soma diária ultrapassar o limite
    Então a solicitação deve ser rejeitada
    E a resposta deve possuir o código de motivo "DAILY_LIMIT_EXCEEDED"
    E nenhuma transação deve ser criada
```

O código `DAILY_LIMIT_EXCEEDED` também está definido no fluxo F02.

**Resultado baseline:** 🟢 PASS

---

# 5. CT15 | Transação rejeitada não consome limite

Esse caso é **muito importante** porque está explicitamente no critério de aceite do RF-02.

```
  @CT15 @RF02 @EP @funcional @api @baseline
  Cenário: Não consumir limite diário após rejeição da transação
    Dado que a conta possui saldo disponível suficiente
    E que a soma das transações aprovadas no dia está abaixo do limite diário
    Quando eu solicitar um PIX que ultrapasse o limite diário
    Então a solicitação deve ser rejeitada
    E nenhuma transação deve ser criada
    E o valor rejeitado não deve ser contabilizado na soma diária
    Quando eu solicitar um novo PIX que esteja dentro do limite disponível
    Então a validação do limite diário deve ser aprovada
```

Aqui temos um pequeno fluxo dentro do cenário.

Isso é justificável porque estamos verificando uma **regra de estado do limite**:

```
antes
  ↓
tentativa rejeitada
  ↓
limite permanece igual
  ↓
nova operação válida
  ↓
pode prosseguir
```

O RF-02 determina explicitamente que transações rejeitadas não consumam saldo nem limite.

---

# 6. CT16 | Transação aprovada consome limite

Esse completa o comportamento.

```
  @CT16 @RF02 @EP @funcional @api @baseline
  Cenário: Consumir limite diário após transação aprovada
    Dado que a conta possui saldo disponível suficiente
    E que a soma das transações aprovadas no dia está abaixo do limite diário
    Quando eu realizar um PIX que seja aprovado
    Então o valor da transação deve ser considerado na soma diária
    E o limite diário disponível deve ser reduzido pelo valor aprovado
```

Esse caso materializa a regra:

> o cálculo considera as transações **já aprovadas no mesmo dia**.
