| ID    | Cenário                              | Técnica                           | Tipo                  | Nível | Status            |
| ----- | ------------------------------------ | --------------------------------- | --------------------- | ----- | ----------------- |
| CT32  | RequestId inédito                    | EP                                | Funcional             | API   | 🟢                |
| CT33  | Repetição da mesma solicitação       | EP                                | Funcional             | API   | 🔵 Target         |
| CT34  | Chamadas simultâneas                 | EP + Experiência                  | Funcional/Resiliência | API   | 🔵 Target         |
| CT35  | Retry após timeout                   | Experiência + Transição de Estado | Resiliência           | API   | 🔵 Target         |
| CT36  | Mesmo requestId + conteúdo diferente | EP                                | Funcional             | API   | 🔵 Target         |
| CT37  | Retry após rejeição                  | EP                                | Funcional             | API   | 🟡 Regra          |
| CT38  | Repetição em REVIEW                  | Transição de Estado               | Funcional             | API   | 🟡 Regra          |
| GAP03 | Timeout + retry duplicado            | Experiência                       | Resiliência           | E2E   | 🔴 Caracterização |

# Onde entra a técnica de Transição de Estado?

Aqui podemos construir uma pequena matriz:

| Estado atual           | Evento                  | Resultado esperado           |
| ---------------------- | ----------------------- | ---------------------------- |
| Não processada         | Enviar requestId novo   | Processando                  |
| Processando            | Processamento concluído | APPROVED                     |
| Processando            | Risco exige análise     | REVIEW                       |
| Processando            | Regra impede operação   | REJECTED                     |
| Processando            | Timeout                 | Resultado desconhecido       |
| Resultado desconhecido | Retry mesmo requestId   | Recuperar resultado original |
| APPROVED               | Retry mesmo requestId   | Mesmo transactionId          |
| REVIEW                 | Retry mesmo requestId   | Mesmo transactionId/estado   |
| REJECTED               | Retry                   | Regra depende do motivo      |

O CTFL destaca que tabelas de estado são especialmente úteis porque permitem representar também **transições inválidas**.

E é exatamente aqui que eu colocaria a técnica no nosso workshop.

---

# 7. A grande provocação da Feature 05

Imagine a suíte inicial:

```
187 testes
187 aprovados
0 falhas
94% coverage
```

Tudo verde. 🌿

Então fazemos:

```
PIX R$ 1.500
      ↓
PROCESSADO
      ↓
TIMEOUT
      ↓
"Tentar novamente"
      ↓
PIX R$ 1.500
      ↓
PROCESSADO NOVAMENTE
```

Resultado:

```
2 transações
2 débitos
1 intenção do usuário
```

E aí a pergunta do workshop fica muito mais poderosa:

> **"Quantos dos nossos testes verdes provaram que uma operação só acontece uma vez?"**

Essa é a essência da Feature 05.

---

## Feature 05 fechada

Nossa evolução até agora fica:

```
01 ─ Validação
       ↓
02 ─ Saldo e limite
       ↓
03 ─ Risco da transação
       ↓
04 ─ Comportamento recente
       ↓
05 ─ Idempotência
       ↓
     "E se eu não souber
      se já processei?"
```

E isso prepara muito bem a **Feature 06: Comunicação do resultado**, onde vamos testar `APPROVED`, `REVIEW`, `REJECTED`, timeout, erro recuperável/não recuperável e principalmente se a mensagem realmente permite ao cliente saber **o que fazer a seguir**.
