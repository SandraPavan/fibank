# Matriz da Feature 02

| ID   | Cenário                           | Técnica | Tipo      | Nível | Baseline          |
| ---- | --------------------------------- | ------- | --------- | ----- | ----------------- |
| CT08 | Saldo suficiente                  | EP      | Funcional | API   | 🟢                |
| CT09 | Saldo insuficiente                | EP      | Funcional | API   | 🟢                |
| CT10 | Valor igual ao saldo              | BVA     | Funcional | API   | 🟢                |
| CT11 | Valor acima do saldo              | BVA     | Funcional | API   | 🟢                |
| CT12 | Limite diário não atingido        | EP      | Funcional | API   | 🟢                |
| CT13 | Limite diário exatamente atingido | BVA     | Funcional | API   | 🟡 Regra pendente |
| CT14 | Limite diário excedido            | BVA     | Funcional | API   | 🟢                |
| CT15 | Rejeição não consome limite       | EP      | Funcional | API   | 🟢                |
| CT16 | Aprovação consome limite          | EP      | Funcional | API   | 🟢                |

---

# 8. O que deliberadamente NÃO colocamos aqui

Essa parte é essencial para preservar a narrativa do workshop.

### Não testamos múltiplas transações suspeitas

Não teremos:

```
R$ 4.900
R$ 4.900
R$ 4.900
...
```

Isso pertence ao comportamento recente do `RF-04`, não ao simples controle de limite diário. O desenho-alvo prevê frequência e soma acumulada, mas isso é justamente uma evolução posterior do produto.

### Não testamos idempotência

Nada de:

```
mesmo requestId
→ duas chamadas
```

Isso pertence ao `RF-05`.

### Não testamos concorrência

Também não.

### Não testamos timeout

Também não.

### Não testamos dispositivo/horário/destinatário

Esses sinais pertencem ao comportamento antifraude posterior.

---

# 9. Uma coisa importante sobre o CT15

Eu manteria esse teste porque ele é excelente para o workshop.

Imagine que o sistema tenha:

```
Limite diário: R$ 10.000
Utilizado:     R$ 8.000
Disponível:    R$ 2.000
```

O usuário tenta:

```
PIX = R$ 3.000
```

A operação é rejeitada.

O teste precisa provar que o sistema **não transforma isso em**:

```
Utilizado: R$ 11.000 ❌
```

Nem:

```
Disponível: R$ -1.000 ❌
```

A transação rejeitada simplesmente **não entra no cálculo**.

Isso está diretamente no critério de aceite, então faz parte da nossa cobertura legítima, não é uma lacuna escondida.

---

## Então nossa Feature 02 fica conceitualmente assim

```
                 RF-02
                   │
          ┌────────┴────────┐
          │                 │
        SALDO          LIMITE DIÁRIO
          │                 │
      ┌───┴───┐        ┌────┼────┐
      │       │        │    │    │
  suficiente insuf.  abaixo igual acima
      │       │        │    │    │
      └───────┘        └────┼────┘
                            │
                     rejeição não
                     consome limite
```

E tem uma decisão pendente que eu **não fecharia artificialmente**:

### 🔎 Regra no limite diário

Precisamos decidir se:

```
soma diária = limite
```

é:

**APPROVED / permitido**

ou

**REJECTED / DAILY_LIMIT_EXCEEDED**.

O documento exige que esse comportamento seja definido, mas não o define.
