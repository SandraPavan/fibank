# Agora vem nossa Tabela de Decisão

A pergunta aqui é:

> **Que evidência precisa existir dependendo do resultado da operação?**

| Resultado | requestId | transactionId             | reasonCodes      | latência | tentativa |
| --------- | --------- | ------------------------- | ---------------- | -------- | --------- |
| APPROVED  | ✅        | ✅                        | ✅               | ✅       | ✅        |
| REVIEW    | ✅        | conforme estado           | ✅               | ✅       | ✅        |
| REJECTED  | ✅        | não necessariamente       | ✅               | ✅       | ✅        |
| FAILED    | ✅        | não necessariamente       | conforme erro    | ✅       | ✅        |
| Erro      | ✅        | não necessariamente       | conforme erro    | ✅       | ✅        |
| Retry     | ✅        | mesmo ID quando aplicável | conforme decisão | ✅       | ✅        |

Aqui deixamos propositalmente **"conforme estado"** onde a fonte não exige um `transactionId` específico para todo estado.

Não vamos inventar uma regra de domínio que o PRD não estabeleceu.

# Matriz final da Feature 07

| ID    | Cenário                          | Técnica           | Tipo                        | Nível   | Status            |
| ----- | -------------------------------- | ----------------- | --------------------------- | ------- | ----------------- |
| CT51  | Registrar `requestId`            | EP                | Funcional                   | API     | 🟢                |
| CT52  | Correlacionar `transactionId`    | EP                | Funcional                   | API     | 🟢                |
| CT53  | Registrar status                 | EP                | Funcional                   | API     | 🟢                |
| CT54  | Quantidade/taxa por status       | EP                | Observabilidade             | API     | 🔵 Target         |
| CT55  | Registrar latência               | EP                | Performance/Observabilidade | API     | 🔵 Target         |
| CT56  | Registrar tentativas repetidas   | EP                | Observabilidade             | API     | 🔵 Target         |
| CT57  | Correlacionar retry após timeout | Experiência       | Resiliência                 | API/E2E | 🔵 Target         |
| CT58  | Registrar `reasonCodes`          | EP                | Funcional                   | API     | 🟢                |
| CT59  | Não registrar chave PIX completa | Suposição de Erro | Segurança                   | Logs    | 🟢                |
| CT60  | Não registrar dados pessoais     | Suposição de Erro | Segurança                   | Logs    | 🟢                |
| CT61  | Não expor regra antifraude       | Suposição de Erro | Segurança                   | Logs    | 🟢                |
| CT62  | Correlacionar erro               | EP                | Observabilidade             | API     | 🟢                |
| GAP06 | Correlacionar tentativas         | Experiência       | Observabilidade             | API/E2E | 🔴 Caracterização |
| GAP07 | Evidenciar duplicidade           | Experiência       | Observabilidade             | API     | 🔴 Caracterização |
| GAP08 | Identificar `REVIEW` >24h        | EP                | Observabilidade             | API/UI  | 🔴 Caracterização |

---

# E agora fechamos as 7 Features

Nossa estrutura ficou muito boa para o workshop:

```
01  VALIDAÇÃO
    ↓
02  SALDO E LIMITE
    ↓
03  RISCO DA TRANSAÇÃO
    ↓
04  COMPORTAMENTO
    ↓
05  IDEMPOTÊNCIA
    ↓
06  COMUNICAÇÃO
    ↓
07  EVIDÊNCIAS
```

E tem uma coisa que eu acho **muito importante manter na construção final**: os casos não devem ser apenas uma coleção de Gherkins.

Eles precisam formar uma **história de evolução da qualidade**:

```
        TESTES PASSAM
             │
             ▼
     "Temos confiança?"
             │
             ▼
       INVESTIGAMOS
             │
             ▼
       ENCONTRAMOS
          LACUNAS
             │
             ▼
      CRIAMOS NOVOS
         CENÁRIOS
             │
             ▼
       DEFINIMOS A
       REGRA ESPERADA
             │
             ▼
       IMPLEMENTAMOS
             │
             ▼
       TESTE PASSA
```

Isso está muito alinhado à estratégia do projeto: separar **characterization** do baseline e **target** da solução, mantendo as lacunas deliberadas para a dinâmica do workshop.

E o mais interessante é que **Feature 07 fecha o ciclo**: não basta testar uma regra. Precisamos conseguir produzir evidências para saber **o que aconteceu, por que aconteceu e onde aconteceu**.
