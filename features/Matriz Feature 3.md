# Matriz da Feature 03

| ID   | Cenário                                   | Técnica | Tipo      | Nível | Baseline          |
| ---- | ----------------------------------------- | ------- | --------- | ----- | ----------------- |
| CT17 | Transação dentro das regras atuais        | EP      | Funcional | API   | 🟢                |
| CT18 | Acima do limiar                           | EP      | Funcional | API   | 🟢                |
| CT19 | Exatamente no limiar                      | BVA     | Funcional | API   | 🟡 Regra pendente |
| CT20 | Decisão determinística                    | EP      | Funcional | API   | 🟢                |
| CT21 | Decisão possui `reasonCodes`              | EP      | Funcional | API   | 🟢                |
| CT22 | Valor acima do limiar possui motivo       | EP      | Funcional | API   | 🟢                |
| CT23 | Dispositivo novo é considerado como sinal | EP      | Funcional | API   | 🟢                |

---

# O que fica propositalmente fora

Aqui começa a aparecer a arquitetura da nossa história.

### ❌ Frequência

Ainda não:

```
10 PIX em 5 minutos
```

### ❌ Soma acumulada

Ainda não:

```
R$ 49.000 em poucos minutos
```

### ❌ Janela temporal

Ainda não.

### ❌ Combinação de sinais

Ainda não:

```
valor alto
+
horário incomum
+
dispositivo novo
+
destinatário novo
```

### ❌ Retry

Ainda não.

### ❌ Idempotência

Ainda não.

Esses elementos pertencem aos requisitos de evolução, principalmente RF-04 e RF-05.

---

# E aqui temos uma decisão didática muito boa

A Feature 03 pode terminar com esta frase no material do workshop:

> **"Temos um antifraude que avalia a transação. Mas ainda não temos um antifraude que entende o comportamento."**

Porque nosso baseline consegue responder:

```
"Este PIX, isoladamente, parece aceitável?"
```

Mas ainda não consegue responder:

```
"O que esta sequência de PIX está nos dizendo?"
```

E é exatamente essa fronteira que prepara a **Feature 04: Avaliar comportamento recente**, onde entram os casos de frequência, soma acumulada, janela temporal, dispositivo novo, destinatário recém-cadastrado e, finalmente, o cenário dos **dez PIX de R$ 4.900** que queremos usar para provocar a descoberta da lacuna.

**Feature 03, portanto, fecha a camada de risco da transação isolada. A Feature 04 será a virada de chave para risco comportamental.**
