| Resultado              | Cliente sabe o resultado? | Pode tentar novamente?     | Próxima ação                |
| ---------------------- | ------------------------- | -------------------------- | --------------------------- |
| `APPROVED`             | Sim                       | Não                        | Ver comprovante             |
| `REVIEW`               | Sim                       | Não                        | Aguardar                    |
| `REJECTED`             | Sim                       | Depende do motivo          | Corrigir/ação indicada      |
| Erro recuperável       | Sim                       | Sim, se seguro             | Tentar novamente            |
| Erro não recuperável   | Sim                       | Não automaticamente        | Corrigir/buscar atendimento |
| `UNKNOWN` após timeout | Não                       | **Não antes de consultar** | Consultar estado            |

Essa tabela materializa o RF-06 de forma muito mais clara que simplesmente testar mensagens.

# Matriz completa

| ID    | Cenário                          | Técnica        | Tipo        | Nível  | Status            |
| ----- | -------------------------------- | -------------- | ----------- | ------ | ----------------- |
| CT40  | Comunicar aprovação              | EP             | Funcional   | API/UI | 🟢                |
| CT41  | Comunicar `REVIEW`               | EP + Transição | Funcional   | API/UI | 🟢                |
| CT42  | Comunicar rejeição               | EP             | Funcional   | API/UI | 🟢                |
| CT43  | Erro recuperável                 | EP             | Resiliência | API/UI | 🔵 Target         |
| CT44  | Erro não recuperável             | EP             | Resiliência | API/UI | 🔵 Target         |
| CT45  | Timeout = resultado desconhecido | EP + Transição | Resiliência | API/UI | 🔵 Target         |
| CT46  | Timeout + operação já concluída  | Transição      | Resiliência | API/UI | 🔵 Target         |
| CT47  | Timeout + operação processando   | Transição      | Resiliência | API/UI | 🔵 Target         |
| CT48  | Detalhes acionáveis              | EP             | Funcional   | UI     | 🟢                |
| CT49  | Não expor dados sensíveis        | EP             | Segurança   | API/UI | 🟢                |
| CT50  | Correlação por `requestId`       | EP             | Funcional   | API    | 🟢                |
| GAP04 | Timeout tratado como rejeição    | Experiência    | Resiliência | UI     | 🔴 Caracterização |
| GAP05 | Retry sem consultar estado       | Experiência    | Resiliência | UI/E2E | 🔴 Caracterização |

---

# 8. O que eu deixaria fora da Feature 06

Não vamos colocar aqui:

❌ cálculo de `riskScore`  
❌ decisão antifraude  
❌ frequência de PIX  
❌ limite diário  
❌ idempotência propriamente dita  
❌ persistência do histórico

Essas regras já foram cobertas nas features anteriores.

Aqui estamos testando **como o resultado dessas regras chega ao usuário**.

---

# E a sequência começa a ficar muito boa

Agora temos:

```
01  VALIDAÇÃO
    "Os dados são válidos?"

02  SALDO E LIMITE
    "A operação cabe nas regras financeiras?"

03  RISCO
    "Esta transação parece suspeita?"

04  COMPORTAMENTO
    "Este conjunto de operações parece suspeito?"

05  IDEMPOTÊNCIA
    "Se eu repetir, vou processar duas vezes?"

06  COMUNICAÇÃO
    "O usuário sabe o que aconteceu
     e o que deve fazer?"
```

E isso nos leva naturalmente para a **Feature 07: Registrar evidências operacionais**.

Aí vamos sair do ponto de vista do cliente e entrar no ponto de vista de **QA + operação + observabilidade**, testando `requestId`, `transactionId`, status, tentativas repetidas, latência, logs, métricas e proteção de dados.
