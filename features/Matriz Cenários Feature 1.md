### CT01 | Valor válido

Representa a **partição válida** de valor.

Não precisamos testar R$ 1, R$ 10, R$ 100, R$ 1.000 etc. Se pertencem à mesma partição e o comportamento esperado é o mesmo, um representante é suficiente dentro da estratégia de EP. O CTFL explica justamente essa redução sistemática de casos por partições.

---

### CT02 + CT03 | Zero e imediatamente acima de zero

Aqui temos uma combinação deliberada de **EP + BVA**.

```
INVÁLIDO          VÁLIDO
   │                 │
   0                 0,01
   ▲                 ▲
   └──── fronteira ──┘
```

O RF-01 exige explicitamente testes para **zero e valores imediatamente acima de zero**.

Isso é ótimo para o workshop porque depois poderemos perguntar:

> "Nós testamos o limite do valor?"

Sim.

E a resposta será:

> "Sim. Mas isso não significa que testamos o comportamento do produto."

A semente da provocação já está aqui. 🌱

---

### CT04 | Valor negativo

Representa uma partição inválida diferente da fronteira zero.

```
valor < 0     |     valor = 0     |     valor > 0
 INVÁLIDO     |      INVÁLIDO     |     VÁLIDO
```

---

### CT05 | Campo obrigatório

Aqui usamos **Esquema do Cenário** para representar a mesma regra aplicada a diferentes campos.

Isso deixa o Gherkin compacto sem perder a clareza.

E temos uma vantagem didática: o participante consegue enxergar que um único comportamento pode gerar vários casos através dos dados.

---

### CT06 | Chave PIX inválida

É uma partição inválida prevista diretamente no RF-01.

Além disso, o protótipo estabelece que uma chave inexistente ou malformada não deve permitir o avanço para a revisão.

---

### CT07 | Data inválida

Também vem diretamente do RF-01.

---

# Uma decisão importante sobre o CT01

Eu **não colocaria ainda**:

```
Então o status deve ser "APPROVED"
```

Por quê?

Porque estamos construindo a suíte **feature a feature** e o `RF-01` é responsável pela validação da solicitação.

A decisão de `APPROVED`, `REVIEW` ou `REJECTED` pertence à etapa de avaliação de risco e às regras de negócio seguintes. O próprio PRD separa essas responsabilidades: `APPROVED` significa validações concluídas **e** risco abaixo do limiar, enquanto `REVIEW` e `REJECTED` dependem da decisão de negócio/risco.

Isso evita criarmos um cenário que testa quatro coisas quando o nome dele diz que testa uma.

---

# Matriz da Feature 01

| ID   | Cenário                           | Técnica | Tipo      | Nível | Baseline |
| ---- | --------------------------------- | ------- | --------- | ----- | -------- |
| CT01 | Solicitação válida                | EP      | Funcional | API   | 🟢       |
| CT02 | Valor igual a zero                | BVA     | Funcional | API   | 🟢       |
| CT03 | Valor imediatamente acima de zero | BVA     | Funcional | API   | 🟢       |
| CT04 | Valor negativo                    | EP      | Funcional | API   | 🟢       |
| CT05 | Campo obrigatório ausente         | EP      | Funcional | API   | 🟢       |
| CT06 | Chave PIX inválida                | EP      | Funcional | API   | 🟢       |
| CT07 | Data inválida                     | EP      | Funcional | API   | 🟢       |

### E, principalmente, o que **não** está aqui:

❌ saldo insuficiente  
❌ limite diário  
❌ PIX de R$ 4.999 / R$ 5.000 / R$ 5.001  
❌ antifraude  
❌ sequência de transações  
❌ `requestId` repetido  
❌ retry  
❌ timeout  
❌ comportamento temporal

Isso não é esquecimento. É **delimitação da feature**.

---

## Uma observação sobre `requestId`

O contrato exige `requestId` na solicitação e toda resposta deve possuir esse identificador.

Porém, **não vamos testar idempotência aqui**.

Nesta feature estamos verificando:

> **"O `requestId` obrigatório está presente e é preservado na resposta?"**

A pergunta:

> **"O que acontece quando envio o mesmo `requestId` duas vezes?"**

pertence ao futuro `RF-05` e será justamente uma das nossas lacunas do baseline. O requisito de idempotência exige que chamadas repetidas com o mesmo `requestId` não gerem mais de uma transação.

Essa separação é ouro para a narrativa do workshop.

---

### Feature 01 fechada conceitualmente

```
RF-01
 │
 ├── EP ──► valores / campos / chave / data
 │
 ├── BVA ─► 0 / 0,01
 │
 └── Error Guessing ─► vamos usar nas próximas features
```
