## 1. Objetivo

Avaliar se o conjunto de transações recentes de uma conta apresenta comportamento incompatível com seu histórico.

Aqui muda a pergunta:

### Feature 03

> "Qual o risco desta transação?"

### Feature 04

> "Qual o risco deste comportamento?"

Essa diferença é essencial para a narrativa do TDC.

---

# 2. Técnicas de teste

Nesta feature vamos usar principalmente:

### Particionamento de Equivalência

Para separar comportamentos:

```
comportamento normal
        │
        ├── comportamento limítrofe
        │
        └── comportamento suspeito
```

### Análise de Valor Limite

Para:

- quantidade de transações;
- soma acumulada;
- janela temporal.

### Tabela de Decisão

Porque o comportamento pode depender da **combinação de vários sinais**.

### Teste baseado em experiência

Será importante quando começarmos a explorar o comportamento que não estava explicitamente coberto pela suíte inicial.

---

# 3. `comportamento-recente.feature`

```
# language: pt

@feature-comportamento-recente
Funcionalidade: Avaliar comportamento recente da conta
  Como mecanismo antifraude do FinBank
  Quero analisar o comportamento recente de uma conta
  Para identificar padrões que possam indicar uma operação suspeita

  Contexto:
    Dado que a conta "ACC-1001" está ativa
    E que existe histórico de transações da conta
    E que a avaliação considera uma janela temporal configurada
```

---

# CT24 | Comportamento normal

Precisamos primeiro estabelecer o nosso **baseline comportamental**.

```
  @CT24 @RF04 @EP @funcional @api @target
  Cenário: Considerar normal um comportamento compatível com o histórico da conta
    Dado que a conta possui histórico de transações considerado normal
    E que as transações recentes estão dentro do padrão habitual
    Quando o comportamento recente da conta for avaliado
    Então o resultado deve indicar que não foi identificado um padrão suspeito
    E a avaliação deve retornar um "riskScore"
    E a avaliação deve retornar "reasonCodes"
```

Esse cenário é importante porque não queremos criar um antifraude que simplesmente diga:

> "qualquer coisa diferente = fraude".

---

# CT25 | Frequência de transações

Agora introduzimos o primeiro sinal explícito do RF-04.

```
  @CT25 @RF04 @EP @funcional @api @target
  Cenário: Identificar aumento de frequência de transações
    Dado que a conta realizou múltiplas transações em uma janela temporal curta
    E que a frequência está acima do padrão habitual da conta
    Quando o comportamento recente for avaliado
    Então a frequência das transações deve ser considerada na avaliação de risco
    E o resultado deve retornar um "riskScore"
    E o resultado deve retornar "reasonCodes"
```

Aqui temos uma distinção importante:

**considerar o sinal** não significa necessariamente:

```
REJECTED
```

O RF-04 exige que o sinal seja utilizado na avaliação, mas a política final de decisão precisa estar definida.

---

# CT26 | Soma acumulada

```
  @CT26 @RF04 @EP @funcional @api @target
  Cenário: Considerar a soma acumulada das transações recentes
    Dado que a conta realizou múltiplas transações dentro da janela temporal configurada
    E que a soma dos valores dessas transações está acima do padrão esperado
    Quando o comportamento recente for avaliado
    Então a soma acumulada deve ser considerada na avaliação de risco
    E o resultado deve retornar um "riskScore"
    E o resultado deve retornar "reasonCodes"
```

Esse caso começa a nos afastar do pensamento:

```
PIX A → seguro
PIX B → seguro
PIX C → seguro
```

e nos leva para:

```
PIX A
  +
PIX B
  +
PIX C
  +
...
  ↓
COMPORTAMENTO
```

---

# CT27 | Janela temporal

```
  @CT27 @RF04 @BVA @funcional @api @target
  Cenário: Considerar apenas transações dentro da janela temporal configurada
    Dado que a janela de análise está configurada
    E que existem transações dentro e fora dessa janela
    Quando o comportamento recente for avaliado
    Então somente as transações dentro da janela devem compor a análise
    E as transações fora da janela não devem influenciar o resultado
```

Esse caso é muito importante porque evita um erro clássico:

> usar todo o histórico da conta quando a regra deveria olhar apenas o comportamento recente.

---

# CT28 | Transação exatamente na fronteira da janela

Aqui aplicamos BVA.

```
  @CT28 @RF04 @BVA @funcional @api @target
  Cenário: Avaliar transação localizada exatamente no limite da janela temporal
    Dado que a janela de análise está configurada para um período determinado
    E que existe uma transação exatamente no limite inicial da janela
    Quando o comportamento recente for avaliado
    Então o sistema deve aplicar a regra definida para a fronteira temporal
```

⚠️ Aqui também precisamos definir o comportamento:

```
t = início da janela
```

entra ou não entra?

Não devemos inventar essa regra.

---

# CT29 | Dispositivo novo

O RF-04 estabelece explicitamente o **dispositivo novo** como sinal comportamental.

```
  @CT29 @RF04 @EP @funcional @api @target
  Cenário: Considerar dispositivo novo na avaliação do comportamento
    Dado que a conta possui dispositivos conhecidos
    E que uma transação recente foi realizada por um dispositivo não conhecido
    Quando o comportamento recente for avaliado
    Então o dispositivo novo deve ser considerado como sinal de risco
    E o resultado deve retornar um "riskScore"
    E o resultado deve retornar "reasonCodes"
```

---

# CT30 | Destinatário recém-cadastrado

```
  @CT30 @RF04 @EP @funcional @api @target
  Cenário: Considerar destinatário recém-cadastrado na avaliação do comportamento
    Dado que a conta possui histórico de destinatários conhecidos
    E que o destinatário da transação foi cadastrado recentemente
    Quando o comportamento recente for avaliado
    Então o destinatário recém-cadastrado deve ser considerado como sinal de risco
    E o resultado deve retornar um "riskScore"
    E o resultado deve retornar "reasonCodes"
```

Esse cenário é importante porque o RF-04 não olha somente para quantidade e valor.

Ele também olha para **mudança de contexto**.

---

# CT31 | Combinação de sinais

Agora entra a nossa **Tabela de Decisão**.

```
  @CT31 @RF04 @DT @funcional @api @target
  Cenário: Avaliar combinação de sinais comportamentais
    Dado que a conta apresenta:
      | sinal                         | condição |
      | frequência de transações      | elevada  |
      | soma acumulada                | elevada  |
      | dispositivo                   | novo     |
      | destinatário                 | recente |
    Quando o comportamento recente for avaliado
    Então todos os sinais devem ser considerados na decisão
    E o resultado deve retornar um "riskScore"
    E o resultado deve retornar um "status"
    E o resultado deve retornar "reasonCodes"
```

Esse é um dos cenários mais importantes da feature porque começamos a testar **combinação**, e não apenas cada variável isoladamente.

---

# CT63 | Horário incomum

O horário é um sinal explícito do desenho-alvo do RF-04. Este caso fica no perfil `target` porque o baseline não implementa a avaliação comportamental completa.

```
  @CT63 @RF04 @EP @funcional @api @target
  Cenário: Considerar horário incomum na avaliação do comportamento
    Dado que a conta possui um histórico de horários habituais
    E que uma transação ocorre fora do padrão habitual
    Quando o comportamento recente for avaliado
    Então o horário incomum deve ser considerado como sinal de risco
    E o resultado deve retornar um "riskScore"
    E o resultado deve retornar "reasonCodes"
```
