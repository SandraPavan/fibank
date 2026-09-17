## Objetivo

```
Como equipe de QA e operação
Quero registrar evidências correlacionáveis das operações
Para conseguir investigar decisões, falhas, retries e comportamentos anômalos
```

A pergunta central desta feature é:

> **"Se algo der errado em produção, temos evidências suficientes para descobrir o que aconteceu?"**

Isso conversa diretamente com o propósito do nosso workshop.

---

# Técnicas de teste

Para esta feature, vamos utilizar:

- **Particionamento de Equivalência**
- **Tabela de Decisão**
- **Suposição de Erro**
- **Teste baseado em experiência**

E aqui temos uma combinação muito interessante de **teste funcional + segurança + observabilidade**.

---

# O que precisamos conseguir rastrear

A correlação principal será:

```
requestId
    │
    ├── intenção
    │
    ├── confirmação
    │
    ├── tentativa/retry
    │
    └── resultado
           │
           └── transactionId
```

O contrato da API já estabelece `requestId` e `transactionId` como identificadores relevantes, além de `traceId` nos erros.

---

# `evidencias-operacionais.feature`

```
# language: pt

@feature-evidencias-operacionais
Funcionalidade: Registrar evidências operacionais
  Como equipe de QA e operação
  Quero correlacionar os eventos de uma operação PIX
  Para investigar resultados, falhas, retries e comportamentos suspeitos
```

---

# CT51 | Registrar requestId

O primeiro teste verifica a existência da correlação.

```
  @CT51 @RF07 @EP @funcional @api @baseline
  Cenário: Registrar requestId para uma operação PIX
    Dado que uma nova solicitação PIX foi criada
    E que ela possui o "requestId" "REQ-20260818-0001"
    Quando a operação for processada
    Então os registros da operação devem permitir sua correlação pelo "requestId"
```

A ideia é simples:

```
REQ-0001
   │
   ├── criação
   ├── confirmação
   └── resultado
```

Sem isso, investigar uma operação vira caça ao tesouro com mapa queimado.

---

# CT52 | Correlacionar transactionId

```
  @CT52 @RF07 @EP @funcional @api @baseline
  Cenário: Correlacionar a transação ao requestId
    Dado que a solicitação "REQ-20260818-0002" foi processada
    E que foi criada a transação "PIX-88772"
    Quando os registros operacionais forem consultados
    Então deve ser possível relacionar o "requestId" "REQ-20260818-0002"
    ao "transactionId" "PIX-88772"
```

Aqui estamos testando:

```
requestId ─────────► transactionId
```

Isso será especialmente importante para os casos de retry da Feature 05.

---

# CT53 | Registrar status

O RF-07 exige que seja possível calcular quantidade e taxa de cada status.

```
  @CT53 @RF07 @EP @funcional @observabilidade @baseline
  Esquema do Cenário: Registrar o status da operação
    Dado que uma operação terminou com status "<status>"
    Quando as evidências operacionais forem consultadas
    Então deve existir registro do status "<status>"

    Exemplos:
      | status   |
      | APPROVED |
      | REVIEW   |
      | REJECTED |
      | FAILED   |
```

Isso permite posteriormente calcular:

```
quantidade de APPROVED
quantidade de REVIEW
quantidade de REJECTED
```

e suas respectivas taxas.

---

# CT54 | Calcular taxa por status

Agora saímos do registro individual e vamos para a evidência agregada.

```
  @CT54 @RF07 @EP @observabilidade @api @target
  Cenário: Calcular quantidade e taxa por status
    Dado que existem operações com diferentes resultados
    E que as operações estão identificadas por seus respectivos status
    Quando as métricas operacionais forem consultadas
    Então deve ser possível obter a quantidade de operações por status
    E deve ser possível calcular a taxa de cada status
```

Exemplo de fixture:

```
100 operações

APPROVED  → 70
REVIEW    → 20
REJECTED  → 10
```

Resultado:

```
APPROVED → 70%
REVIEW   → 20%
REJECTED → 10%
```

Não precisamos definir uma ferramenta específica de métricas aqui porque a fonte fala da **capacidade de observar**, não de uma tecnologia específica.

---

# CT55 | Registrar latência

O RF-07 também exige observação de latência.

```
  @CT55 @RF07 @EP @performance @observabilidade @api @target
  Cenário: Registrar latência da operação
    Dado que uma solicitação PIX foi processada
    Quando o processamento for concluído
    Então deve existir evidência suficiente para determinar a latência da operação
```

Aqui podemos ter:

```
início
  ↓
14:32:00.000

fim
  ↓
14:32:01.250

latência
  ↓
1.250 ms
```

---

# CT56 | Registrar tentativas repetidas

Esse caso é **muito importante** porque conecta Feature 05 + Feature 07.

```
  @CT56 @RF07 @EP @observabilidade @api @target
  Cenário: Identificar tentativas repetidas da mesma solicitação
    Dado que uma solicitação foi enviada mais de uma vez
    E que as tentativas utilizam o mesmo "requestId"
    Quando as evidências operacionais forem consultadas
    Então deve ser possível identificar que houve tentativas repetidas
    E as tentativas devem permanecer correlacionáveis
```

Isso permite responder:

> "Quantas vezes o cliente tentou?"

e não apenas:

> "Qual foi o resultado final?"

---

# CT57 | Correlacionar retry após timeout

Agora juntamos as três features:

**05 + 06 + 07.**

```
  @CT57 @RF05 @RF06 @RF07 @experiencia @observabilidade @target
  Cenário: Correlacionar uma tentativa após timeout
    Dado que uma operação sofreu timeout no cliente
    E que o backend processou a solicitação original
    Quando o cliente realizar uma nova tentativa com o mesmo "requestId"
    Então as duas tentativas devem ser correlacionáveis
    E deve ser possível identificar o resultado da operação original
    E deve ser possível identificar que ocorreu uma tentativa repetida
```

Esse caso é ouro para o workshop.

Porque temos:

```
requestId
    │
    ├── tentativa 1
    │      └── timeout
    │
    └── tentativa 2
           └── retry
```

E precisamos conseguir reconstruir essa história.

---

# CT58 | Registrar reasonCodes

O RF-07 exige que decisões de risco registrem códigos de motivo.

```
  @CT58 @RF07 @EP @observabilidade @api @baseline
  Cenário: Registrar código de motivo da decisão de risco
    Dado que uma operação foi avaliada pelo antifraude
    E que a decisão possui "reasonCodes"
    Quando as evidências operacionais forem consultadas
    Então o código de motivo deve estar registrado
    E deve ser possível correlacionar o motivo à operação
```

Por exemplo:

```
requestId: REQ-001
status: REVIEW
reasonCodes: [AMOUNT_REQUIRES_REVIEW]
```

---

# CT59 | Não registrar chave PIX completa

Agora entramos em segurança.

O RF-07 determina explicitamente que logs não exibam a chave PIX completa nem outros dados pessoais em claro.

```
  @CT59 @RF07 @EP @seguranca @logs
  Cenário: Não registrar a chave PIX completa nos logs
    Dado que uma operação utiliza a chave PIX "11999999999"
    Quando os registros operacionais forem gerados
    Então a chave PIX completa não deve estar presente nos logs
    E os dados necessários para investigação devem permanecer protegidos
```

---

# CT60 | Não registrar dados pessoais em claro

```
  @CT60 @RF07 @EP @seguranca @logs
  Cenário: Não registrar dados pessoais em claro
    Dado que uma operação possui dados pessoais associados
    Quando os registros operacionais forem gerados
    Então os dados pessoais não devem ser registrados em claro
    E os registros devem manter somente as informações necessárias para investigação
```

Esse cenário conversa também com o **RNF-05**, que determina que somente dados fictícios sejam incluídos no repositório.

---

# CT61 | Não expor detalhes exploráveis do antifraude

Esse é um detalhe importante do RF-07:

> registrar `reasonCodes`, mas não revelar detalhes exploráveis.

Então:

```
  @CT61 @RF07 @EP @seguranca @observabilidade
  Cenário: Registrar motivo sem expor detalhes internos do antifraude
    Dado que uma operação foi encaminhada para análise de risco
    Quando a decisão for registrada
    Então "reasonCodes" deve ser registrado
    E regras internas utilizadas para calcular o risco não devem ser registradas
    E o "riskScore" não deve ser exposto em logs públicos
```

Aqui temos uma distinção excelente:

```
EVIDÊNCIA
    ↓
reasonCodes
    ↓
"AMOUNT_REQUIRES_REVIEW"

não:

    ↓
"riskScore 87 porque regra X +
 dispositivo Y + frequência Z..."
```

---

# CT62 | Operação com erro possui rastreabilidade

Os erros da API possuem `requestId` e `traceId` no contrato.

```
  @CT62 @RF07 @EP @observabilidade @api @baseline
  Cenário: Correlacionar erro operacional por identificadores
    Dado que uma operação apresentou erro
    Quando o erro for retornado ao cliente
    Então a resposta deve possuir um "requestId"
    E deve possuir um "traceId"
    E os identificadores devem permitir correlacionar o erro aos registros operacionais
```

Esse caso é muito útil para suporte.

Imagine o cliente dizendo:

> "Meu PIX deu erro."

Sem correlação:

```
"Qual PIX?"
"Que erro?"
"Quando?"
"Em qual tentativa?"
```

Com correlação:

```
requestId
   ↓
traceId
   ↓
logs
   ↓
tentativa
   ↓
resultado
```
