## Objetivo

Verificar se o antifraude consegue avaliar uma transação individual e produzir uma decisão consistente e explicável.

A resposta esperada do contrato possui:

```
{
  "transactionId": "PIX-88771",
  "requestId": "REQ-20260818-0001",
  "status": "APPROVED",
  "riskScore": 32,
  "reasonCodes": ["WITHIN_CURRENT_RULES"]
}
```

### Técnicas CTFL

Aqui eu usaria principalmente:

- **Tabela de Decisão**
- **Particionamento de Equivalência**
- **Suposição de Erro**, em casos específicos

### Tipo

**Funcional**

### Nível

**API / Integração**

---

# Primeiro precisamos separar RF-03 de RF-04

Essa distinção vai ser **fundamental no workshop**.

### RF-03

Pergunta:

> **"Dadas as características desta transação, qual é a decisão?"**

Exemplo:

```
valor = 4900
dispositivo = conhecido
horário = habitual
destinatário = conhecido
```

### RF-04

Pergunta:

> **"O comportamento dessa conta ao longo do tempo parece suspeito?"**

Exemplo:

```
14:01 → 4900
14:03 → 4900
14:05 → 4900
14:07 → 4900
...
```

O RF-04 adiciona frequência, soma acumulada, horário, dispositivo novo e destinatário recém-cadastrado.

**Não vamos colocar isso na Feature 03.**

Essa é justamente uma das lacunas que queremos preservar.

# `pix-antifraude.feature`

```
# language: pt

@feature-antifraude
Funcionalidade: Avaliar risco da transação PIX
  Como mecanismo antifraude do FinBank
  Quero avaliar o risco de uma transação
  Para determinar se ela pode ser aprovada ou precisa de análise

  Contexto:
    Dado que a conta "ACC-1001" está ativa
    E que a chave PIX "11999999999" é válida
    E que o dispositivo "DEV-9988" é conhecido
    E que o horário da transação está dentro do período habitual
```

---

# CT17 | Transação dentro das regras atuais

Esse será nosso cenário de **partição de baixo risco**.

```
  @CT17 @RF03 @EP @funcional @api @baseline
  Cenário: Aprovar transação dentro das regras atuais
    Dado que o valor da transação está abaixo do limiar de revisão
    E que o dispositivo utilizado é conhecido
    E que o horário da transação é habitual
    Quando eu solicitar um PIX de "1000.00" reais
    Então a avaliação de risco deve ser realizada
    E o status deve ser "APPROVED"
    E o "riskScore" deve ser retornado
    E "reasonCodes" deve conter "WITHIN_CURRENT_RULES"
```

O `WITHIN_CURRENT_RULES` está definido como código de motivo inicial no domínio da API.

🟢 **Baseline: PASS**

---

# CT18 | Transação acima do limiar

Esse é obrigatório porque está diretamente no critério de aceite do RF-03.

```
  @CT18 @RF03 @EP @funcional @api @baseline
  Cenário: Encaminhar para análise uma transação acima do limiar
    Dado que o limiar de revisão está configurado em "5000.00" reais
    Quando eu solicitar um PIX de "5001.00" reais
    Então a avaliação de risco deve ser realizada
    E o status deve ser "REVIEW"
    E o "riskScore" deve ser retornado
    E "reasonCodes" deve indicar que o valor requer análise
```

O domínio define `AMOUNT_REQUIRES_REVIEW` como um dos códigos de motivo iniciais.

🟢 **Baseline: PASS**

---

# CT19 | Valor exatamente no limiar

Aqui temos outra fronteira importante.

```
  @CT19 @RF03 @BVA @funcional @api @baseline
  Cenário: Avaliar transação exatamente no limiar de revisão
    Dado que o limiar de revisão está configurado em "5000.00" reais
    Quando eu solicitar um PIX de "5000.00" reais
    Então a avaliação de risco deve ser realizada
    E o resultado deve seguir a regra configurada para o limite
    E o "riskScore" deve ser retornado
    E "reasonCodes" deve ser retornado
```

### ⚠️ Decisão de domínio pendente

Aqui novamente não vamos inventar.

Precisamos definir se:

```
5000 → APPROVED
```

ou:

```
5000 → REVIEW
```

O material exige que o comportamento no limite seja definido e testado, mas não fornece essa decisão.

Portanto, **o Gherkin fica preparado e a regra será fechada antes da implementação**.

---

# CT20 | Risk score determinístico

Esse teste é particularmente importante porque o RF-03 exige determinismo.

```
  @CT20 @RF03 @EP @funcional @api @baseline
  Cenário: Retornar a mesma decisão para a mesma entrada e histórico
    Dado que existe uma transação com os seguintes dados:
      | campo        | valor             |
      | amount       | 1000.00           |
      | deviceId     | DEV-9988          |
      | timestamp    | 2026-08-18T14:32  |
      | recipientKey | 11999999999       |
    E que o histórico da conta é o mesmo nas duas avaliações
    Quando eu avaliar a transação pela primeira vez
    E avaliar novamente a mesma transação
    Então o "riskScore" deve ser igual nas duas avaliações
    E o "status" deve ser igual nas duas avaliações
    E "reasonCodes" deve ser igual nas duas avaliações
```

Isso não é apenas um teste de resultado.

Estamos testando uma propriedade do mecanismo:

```
mesma entrada
      +
mesmo histórico
      ↓
mesma decisão
```

O RF-03 exige exatamente essa determinística.

🟢 **Baseline: PASS**

---

# CT21 | Decisão explicável por código de motivo

Aqui queremos garantir que o resultado não seja apenas:

```
REVIEW
```

mas que exista uma justificativa estruturada.

```
  @CT21 @RF03 @EP @funcional @api @baseline
  Esquema do Cenário: Retornar código de motivo para a decisão de risco
    Dado que uma transação possui características que exigem a decisão "<status>"
    Quando o antifraude avaliar a transação
    Então o resultado deve possuir "reasonCodes"
    E "reasonCodes" deve explicar a decisão de risco

    Exemplos:
      | status   |
      | APPROVED |
      | REVIEW   |
      | REJECTED |
```

Aqui precisamos ter cuidado com `REJECTED`: o RF-03 permite que o risco impeça o processamento, mas o material disponível não especifica ainda **qual combinação concreta da transação individual obrigatoriamente gera `REJECTED`**.

Então podemos manter o comportamento como requisito de contrato, mas a massa concreta precisa ser definida na regra do produto.

---

# CT22 | Valor acima do limiar retorna código específico

```
  @CT22 @RF03 @EP @funcional @api @baseline
  Cenário: Identificar por código de motivo uma transação acima do limiar
    Dado que o limiar de revisão está configurado em "5000.00" reais
    Quando eu solicitar um PIX de "5001.00" reais
    Então o status deve ser "REVIEW"
    E "reasonCodes" deve conter "AMOUNT_REQUIRES_REVIEW"
```

Esse caso é propositalmente mais específico que o CT18.

CT18 verifica:

> **qual é o comportamento?**

CT22 verifica:

> **a decisão é explicável?**

Isso é uma distinção boa para a suíte.

---

# CT23 | Dispositivo novo

Agora temos uma situação interessante.

O domínio define `NEW_DEVICE` como sinal disponível, mas diz explicitamente que o tratamento é **intencionalmente simplista no baseline**.

Então podemos testar o sinal sem transformar isso em uma regra antifraude sofisticada.

```
  @CT23 @RF03 @EP @funcional @api @baseline
  Cenário: Registrar sinal de dispositivo novo na avaliação de risco
    Dado que a conta "ACC-1001" não possui o dispositivo "DEV-NEW-01" como conhecido
    E que o valor da transação está dentro do limite configurado
    Quando eu solicitar um PIX utilizando o dispositivo "DEV-NEW-01"
    Então a avaliação de risco deve considerar o dispositivo novo
    E o resultado deve possuir um "riskScore"
    E o resultado deve possuir "reasonCodes"
```

⚠️ **Não vamos determinar aqui que dispositivo novo obrigatoriamente significa `REVIEW`.**

Isso não está sustentado pelo RF-03.

O que sabemos é que o sinal existe. O comportamento simplista do baseline precisa ser definido na implementação.

---

# Cenário deliberadamente excluído | Horário incomum

Aqui temos a mesma lógica.

O material do projeto lista horário como uma camada de risco, mas o RF-04 é que explicitamente leva esse sinal para a avaliação de **comportamento recente**.

Esse cenário não pertence à Feature 03. Ele está definido como **CT63** na Feature 04, com perfil `@target`.

E isso é uma decisão importante.

### Por quê?

Porque se colocarmos:

```
Cenário: Rejeitar PIX em horário incomum
```

estaremos inventando uma regra que pertence ao desenho comportamental.

Então:

**❌ não entra no baseline da Feature 03.**

Consulte o CT63 na Feature 04.
