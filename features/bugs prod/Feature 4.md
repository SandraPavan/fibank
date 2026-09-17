E aqui precisamos fazer uma distinção fundamental.

O caso abaixo é o **incidente de produção reproduzido**.

A pesquisa do workshop define:

> 10 PIX de R$ 4.900 em poucos minutos.

E o baseline deve inicialmente **não detectar esse padrão**.

Portanto, esse cenário **não deve entrar como um teste verde do baseline**.

Ele será nosso **teste de descoberta da lacuna**.

---

# GAP01 | Fraude fracionada

```
  @GAP01 @RF04 @BVA @EXPERIENCIA @fraude-fracionada
  Cenário: Identificar sequência de PIX fracionados abaixo do limite
    Dado que a conta possui limite individual de PIX de "5000.00" reais
    E que a conta não possui histórico recente compatível com múltiplas transações consecutivas
    Quando forem realizadas 10 transações de "4900.00" reais
    em poucos minutos
    Então o comportamento acumulado deve ser considerado suspeito
    E o resultado deve refletir a frequência das transações
    E o resultado deve refletir a soma acumulada
    E o resultado deve possuir um "riskScore" compatível com o comportamento identificado
```

### E aqui está o detalhe didático:

**Esse cenário provavelmente falha no baseline.**

E isso é exatamente o que queremos.

```
                BASELINE
                   │
                   ▼
             10 × R$ 4.900
                   │
                   ▼
             ❌ não detectado
                   │
                   ▼
              GAP REVELADO
                   │
                   ▼
          novo requisito/regra
                   │
                   ▼
             novo teste
```

A suíte não "estava errada".

Ela estava **incompleta em relação ao risco real**.

Essa é uma das mensagens centrais do workshop.

---

# GAP02 | Mesmo comportamento, mas valores abaixo do limite

Também podemos tornar o teste mais interessante.

```
  @GAP02 @RF04 @EP @EXPERIENCIA @fraude-fracionada
  Cenário: Identificar comportamento suspeito mesmo quando cada transação está abaixo do limite
    Dado que o limite individual do PIX é de "5000.00" reais
    E que cada transação individual está abaixo desse limite
    Quando múltiplas transações forem realizadas em uma janela curta
    E a soma acumulada ultrapassar o comportamento esperado para a conta
    Então o mecanismo deve avaliar o comportamento acumulado
    E não considerar apenas o valor individual de cada transação
```

Esse caso é **conceitualmente mais importante que o primeiro**.

Porque ele explicita a falha:

```
                 REGRA ATUAL
                     │
              valor individual
                     │
               < R$ 5.000
                     │
                  PASSA
                     │
                     X
                     │
             risco acumulado
```
