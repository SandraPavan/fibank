# Matriz de cobertura | RF × Critério de aceite × Testes

### Legenda

- 🟢 **Especificado**: temos caso com expectativa suficiente; isso não implica que passe no baseline.
- 🟡 **Parcial**: existe caso, mas falta fechar alguma regra ou detalhe.
- 🔴 **Caracterização**: o caso reproduz uma falha intencional do baseline na suíte reservada.
- 🔵 **Target**: o caso descreve a solução-alvo e pode falhar no baseline.

As convenções completas e a precedência entre documentos estão em [README.md](README.md).

---

## RF-01 | Validar a solicitação

O RF-01 exige rejeição de entrada inválida, identificação da regra violada e cobertura dos limites, incluindo zero e valores imediatamente acima de zero.

| Critério de aceite                               | Caso(s)         | Técnica  | Cobertura |
| ------------------------------------------------ | --------------- | -------- | --------- |
| Campos obrigatórios ausentes são rejeitados      | CT05            | EP       | 🟢        |
| Valor menor ou igual a zero é rejeitado          | CT02 e CT04     | EP + BVA | 🟢        |
| Chave PIX inválida é rejeitada                   | CT06            | EP       | 🟢        |
| Data inválida é rejeitada                        | CT07            | EP       | 🟢        |
| Nenhuma transação é criada para entrada inválida | CT02, CT04–CT07 | EP       | 🟢        |
| Resposta identifica campo/regra violada          | CT02, CT04–CT07 | EP       | 🟢        |
| Zero possui teste específico                     | CT02            | BVA      | 🟢        |
| Valor imediatamente acima de zero possui teste   | CT03            | BVA      | 🟢        |

**Situação: 🟢 Coberto**

---

# RF-02 | Validar saldo e limite diário

O RF-02 exige considerar transações aprovadas no mesmo dia, testar exatamente o limite e garantir que rejeições não consumam saldo/limite.

| Critério de aceite                                  | Caso(s) | Técnica | Cobertura |
| --------------------------------------------------- | ------- | ------- | --------- |
| Saldo insuficiente impede operação                  | CT09    | EP      | 🟢        |
| Saldo suficiente permite operação                   | CT08    | EP      | 🟢        |
| Transações aprovadas do mesmo dia entram no cálculo | CT16    | EP      | 🟢        |
| Transações de outro dia não entram                  | CT12    | EP      | 🟡        |
| Valor exatamente no limite diário é testado         | CT13    | BVA     | 🟡        |
| Valor acima do limite diário é rejeitado            | CT14    | BVA     | 🟢        |
| Rejeição não consome saldo                          | CT15    | EP      | 🟢        |
| Rejeição não consome limite diário                  | CT15    | EP      | 🟢        |

### ⚠️ Ponto para fechar

Precisamos **definir explicitamente o comportamento exatamente no limite**:

```
limite = R$ 10.000

R$ 9.999,99 → ?
R$ 10.000,00 → ?
R$ 10.000,01 → ?
```

O PRD exige que esse comportamento seja definido e testado, mas não define aqui se igualdade significa aprovação ou rejeição.

Além da decisão de igualdade, o CT12 precisa explicitar uma transação de outro dia para provar que ela não entra na soma.

**Situação: 🟡 Parcial**

---

# RF-03 | Avaliar risco da transação atual

O RF-03 exige `riskScore`, `status` e `reasonCodes` determinísticos, `REVIEW` acima do limiar e limiares configuráveis.

| Critério de aceite                              | Caso      | Técnica | Cobertura |
| ----------------------------------------------- | --------- | ------- | --------- |
| Retornar `riskScore`                            | CT17      | EP      | 🟢        |
| Retornar `status`                               | CT17      | EP      | 🟢        |
| Retornar `reasonCodes`                          | CT21      | EP      | 🟢        |
| Mesma entrada + mesmo histórico = mesma decisão | CT20      | EP      | 🟢        |
| Acima do limiar → `REVIEW`                      | CT18      | BVA/EP  | 🟢        |
| Exatamente no limiar                            | CT19      | BVA     | 🟡        |
| Código explica a decisão                        | CT21/CT22 | EP      | 🟢        |
| Limiar configurável                             | CT18/CT19 | BVA     | 🟡        |

### ⚠️ Lacuna

Novamente, precisamos fechar:

> **O que acontece exatamente no limiar?**

Esse ponto deve ser decidido antes de transformar CT19 em teste automatizado definitivo.

**Situação: 🟡 Parcial**

---

# RF-04 | Avaliar comportamento recente

Aqui começa a parte mais importante do workshop.

O desenho-alvo exige frequência, soma acumulada, horário, dispositivo novo, destinatário recém-cadastrado, janela temporal, combinação de sinais e o cenário dos dez PIX de R$ 4.900.

| Critério                                  | Caso                 | Técnica           | Cobertura |
| ----------------------------------------- | -------------------- | ----------------- | --------- |
| Frequência de transações                  | CT25                 | EP                | 🟢        |
| Soma acumulada                            | CT26                 | EP                | 🟢        |
| Janela temporal                           | CT27                 | EP                | 🟢        |
| Limite da janela                          | CT28                 | BVA               | 🟡        |
| Horário                                   | CT63                 | EP                | 🔵        |
| Dispositivo novo                          | CT29                 | EP                | 🟢        |
| Destinatário recém-cadastrado             | CT30                 | EP                | 🟢        |
| Combinação de sinais                      | CT31                 | Tabela de Decisão | 🟢        |
| Histórico reproduzível por fixtures       | **FALTA explicitar** | EP                | 🟡        |
| 10 × R$ 4.900 em poucos minutos           | GAP01                | Experiência/BVA   | 🔵        |
| Comparação com PIX isolado de R$ 4.900    | GAP01/GAP02          | EP                | 🔵        |
| Combinação eleva para `REVIEW`/`REJECTED` | CT31                 | Tabela de Decisão | 🟡        |

### Caso target adicionado

Nós falamos de **horário incomum** na discussão, mas deliberadamente não criamos o caso porque o material separava esse comportamento do baseline.

O RF-04 do **desenho-alvo** exige horário. Por isso, o CT63 está definido na Feature 04, indexado em sua matriz e apenas referenciado neste resumo.

**Situação atual: 🟡 Parcial**, pois a fronteira temporal e a política de combinação ainda dependem de decisões de domínio.

---

# RF-05 | Garantir idempotência

O RF-05 define três critérios muito claros: concorrência, retry após timeout e reutilização do `requestId` com conteúdo diferente.

| Critério                                               | Caso | Técnica                 | Cobertura |
| ------------------------------------------------------ | ---- | ----------------------- | --------- |
| Mesmo requestId não gera duas transações               | CT33 | EP                      | 🟢        |
| Mesmo requestId não gera dois débitos                  | CT33 | EP                      | 🟢        |
| Duas chamadas simultâneas retornam mesmo transactionId | CT34 | Experiência/EP          | 🟢        |
| Retry após timeout não duplica                         | CT35 | Experiência + Transição | 🟢        |
| Retry retorna transactionId original                   | CT35 | Transição               | 🟢        |
| Mesmo requestId + payload diferente → conflito         | CT36 | EP                      | 🟢        |
| Operação em REVIEW não gera nova transação             | CT38 | Transição               | 🟡        |

### Situação: 🟢 **Critérios principais especificados para o target**

O CT38 continua dependendo de uma definição mais precisa sobre como o estado `REVIEW` deve responder a uma repetição, mas isso é complementar aos três critérios explícitos do RF-05.

---

# RF-06 | Comunicar resultado acionável

O RF-06 exige distinguir cinco situações e orientar o cliente corretamente.

| Critério                                     | Caso      | Cobertura |
| -------------------------------------------- | --------- | --------- |
| Sucesso comunicado                           | CT40      | 🟢        |
| Análise comunicada                           | CT41      | 🟢        |
| Rejeição comunicada                          | CT42      | 🟢        |
| Erro recuperável                             | CT43      | 🟢        |
| Erro não recuperável                         | CT44      | 🟢        |
| Cliente sabe se deve aguardar                | CT41/CT47 | 🟢        |
| Cliente sabe se pode tentar novamente        | CT43      | 🟢        |
| Timeout não é rejeição definitiva            | CT45      | 🟢        |
| Operação concluída após timeout é recuperada | CT46      | 🟢        |
| Operação ainda processando após timeout      | CT47      | 🟢        |
| Não expor regra antifraude                   | CT49      | 🟢        |

### Situação: 🟢 **Especificado**

Mas temos um **GAP de experiência** muito relevante:

```
timeout
   ↓
Tentar novamente
   ↓
consultar requestId antes
```

Isso está no protótipo como evolução do comportamento de retry.

Por isso:

**GAP04/GAP05 = 🔵 Target**

---

# RF-07 | Registrar evidências operacionais

O RF-07 exige correlação, métricas, latência, retries, proteção de dados e reason codes.

| Critério                                  | Caso | Técnica           | Cobertura |
| ----------------------------------------- | ---- | ----------------- | --------- |
| Correlacionar por requestId               | CT51 | EP                | 🟢        |
| Correlacionar transactionId               | CT52 | EP                | 🟢        |
| Quantidade por status                     | CT54 | EP                | 🟢        |
| Taxa por status                           | CT54 | EP                | 🟢        |
| Observar latência                         | CT55 | EP                | 🟢        |
| Observar tentativas repetidas             | CT56 | EP                | 🟢        |
| Correlacionar retry                       | CT57 | Experiência       | 🟢        |
| Registrar `reasonCodes`                   | CT58 | EP                | 🟢        |
| Não registrar chave PIX completa          | CT59 | Suposição de Erro | 🟢        |
| Não registrar dados pessoais em claro     | CT60 | Suposição de Erro | 🟢        |
| Não expor detalhes do antifraude          | CT61 | Suposição de Erro | 🟢        |
| Correlacionar erros por requestId/traceId | CT62 | EP                | 🟢        |

### Situação: 🟢 **Especificado**

---

# 📊 Visão consolidada

Agora podemos montar o verdadeiro **painel de cobertura**:

| RF        | Critérios avaliados | 🟢     | 🟡    | 🔴    | 🔵 Target |
| --------- | ------------------- | ------ | ----- | ----- | --------- |
| RF-01     | 8                   | 8      | 0     | 0     | 0         |
| RF-02     | 8                   | 5      | 3     | 0     | 0         |
| RF-03     | 8                   | 6      | 2     | 0     | 0         |
| RF-04     | 12                  | 6      | 3     | 0     | 3         |
| RF-05     | 7                   | 6      | 1     | 0     | 0         |
| RF-06     | 11                  | 11     | 0     | 0     | 0         |
| RF-07     | 12                  | 12     | 0     | 0     | 0         |
| **TOTAL** | **66**              | **54** | **9** | **0** | **3**     |

### Em percentual

Temos aproximadamente:

- 🟢 **81,8% dos critérios especificados**
- 🟡 **13,6% parcialmente especificados**
- 🔴 **0% sem caso de caracterização quando aplicável**
- 🔵 **4,5% descritos diretamente como target**

Isso é **muito mais interessante para o workshop do que dizer simplesmente "100% dos requisitos cobertos"**.

Porque descobrimos que **ter uma Feature para cada RF não significa ter 100% dos critérios de aceite cobertos**.

---

# 🚨 E temos 3 ações claras

A matriz nos entregou três coisas para corrigirmos antes de congelar os testes:

### 1. Automatizar CT63 no target

**RF-04 → horário incomum**

Porque o requisito exige esse sinal e ainda não temos um caso específico.

### 2. Fechar as regras de fronteira

Precisamos decidir:

```
RF-02
limite exatamente igual

RF-03
limiar exatamente igual

RF-04
início/fim da janela temporal
```

O CTFL recomenda justamente que critérios de aceite sejam claros e não ambíguos, e que os casos sejam derivados deles.

### 3. Separar definitivamente

```
BASELINE
🟢 o que já existe

GAP
🔴 o que descobrimos

TARGET
🔵 o que será construído para resolver
```

Isso é especialmente importante porque a documentação do próprio workshop determina que o baseline inicial **não deve satisfazer todos os requisitos-alvo**, e que as lacunas fazem parte do produto didático.
