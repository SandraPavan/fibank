A estratégia de testes define explicitamente que a suíte pública inicial **não deve incluir** alguns cenários, entre eles timeout após persistência, retries e outras lacunas.

Para nossa Feature 07, eu criaria estes gaps como **descobertas/evolução**, não como testes verdes do baseline.

## GAP06 | Não conseguimos correlacionar as tentativas

```
  @GAP06 @RF07 @observabilidade
  Cenário: Identificar todas as tentativas relacionadas a uma mesma operação
    Dado que uma operação sofreu timeout
    E que houve uma nova tentativa
    Quando a equipe consultar as evidências operacionais
    Então deve ser possível identificar ambas as tentativas
    E relacioná-las ao mesmo "requestId"
```

---

## GAP07 | Não conseguimos identificar o impacto do retry

```
  @GAP07 @RF05 @RF07 @observabilidade
  Cenário: Identificar duplicidade causada por tentativas repetidas
    Dado que uma operação foi processada mais de uma vez
    Quando as evidências operacionais forem analisadas
    Então deve ser possível identificar as tentativas duplicadas
    E relacioná-las aos respectivos "transactionId"
    E identificar o impacto financeiro da duplicidade
```

Esse é particularmente interessante porque conecta:

```
Feature 05
Idempotência
       ↓
defeito
       ↓
Feature 07
Evidência
       ↓
conseguimos provar o defeito?
```

---

## GAP08 | Análise parada por mais de 24 horas

Esse caso aparece explicitamente nos fluxos do projeto: existe uma transação `REVIEW` com mais de 24 horas e a T06 deve evidenciar sua idade.

```
  @GAP08 @RF06 @RF07 @observabilidade
  Cenário: Identificar transação em análise há mais de 24 horas
    Dado que existe uma transação com status "REVIEW"
    E que ela está nesse estado há mais de 24 horas
    Quando as evidências operacionais forem consultadas
    Então a idade da análise deve ser identificável
    E a operação deve ser elegível para monitoramento operacional
```

A fonte é clara sobre a **evidenciação da idade**, mas não define um SLA específico ou uma ação automática. Então não vamos inventar isso no teste.
