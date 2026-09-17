# E aqui aparece uma lacuna muito boa

O protótipo mostra uma tela de erro com:

> **Tentar Novamente**

Mas a análise do protótipo aponta justamente o problema:

> T05 permite nova tentativa sem apresentar consulta de status ou garantia de idempotência.

Então podemos criar um **GAP de produção**.

## GAP03 | Timeout + retry duplicado

```
  @GAP03 @RF05 @RESILIENCIA @EXPERIENCIA
  Cenário: Evitar duplicidade quando o cliente tenta novamente após timeout
    Dado que o cliente enviou um PIX de "1500.00" reais
    E que o backend processou a operação
    Mas o cliente recebeu um timeout
    Quando o cliente selecionar "Tentar Novamente"
    E reenviar a operação
    Então o sistema deve identificar a solicitação original
    E não deve criar uma segunda transação
    E deve apresentar o resultado da operação original
```

### Esse teste é diferente do CT35?

Sim.

**CT35** é o teste da regra de idempotência.

**GAP03** é o teste da **experiência completa que levou ao incidente**:

```
T03
 ↓
Processamento
 ↓
Backend processa
 ↓
Timeout
 ↓
T05
 ↓
Tentar novamente
 ↓
duplicidade?
```

Isso conecta o backend ao comportamento do produto.
