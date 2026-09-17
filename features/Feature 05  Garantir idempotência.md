## Objetivo

Garantir que o sistema trate corretamente chamadas repetidas da mesma solicitação, evitando:

- duas transações;
- dois débitos;
- duas respostas com transações diferentes;
- inconsistência após timeout;
- processamento duplicado por concorrência.

O RF-05 estabelece três comportamentos principais:

1. duas chamadas simultâneas com o mesmo `requestId` devem retornar o mesmo `transactionId`;
2. repetir a chamada após timeout não pode duplicar o processamento;
3. reutilizar o mesmo `requestId` com conteúdo diferente deve retornar conflito.

---

# Técnicas CTFL

Aqui eu usaria:

- **Particionamento de Equivalência**
- **Teste de Transição de Estado**
- **Teste baseado em experiência**
- **Tabela de Decisão**, para combinar situação da requisição e conteúdo enviado.

E temos uma oportunidade muito boa de aplicar **transição de estados** de verdade.

O CTFL define que um caso de teste baseado em transição de estados normalmente representa uma sequência de eventos que provoca uma sequência de mudanças de estado.

---

# Estados que vamos considerar

Para a Feature 05, podemos modelar o comportamento da solicitação assim:

```
                    ┌──────────────┐
                    │  SOLICITADA  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ PROCESSANDO  │
                    └──────┬───────┘
                           │
                 ┌─────────┼─────────┐
                 ▼         ▼         ▼
             APPROVED    REVIEW   REJECTED
```

E temos uma situação especial:

```
PROCESSANDO
     │
     │ timeout
     ▼
RESULTADO DESCONHECIDO
     │
     │ retry com mesmo requestId
     ▼
consultar/reutilizar resultado
```

Essa parte é fundamental.

**Timeout não significa rejeição.**

O PRD determina que o cliente consiga diferenciar erro recuperável e não recuperável, e que timeout não seja apresentado como rejeição definitiva.

# `idempotencia.feature`

```
# language: pt

@feature-idempotencia
Funcionalidade: Garantir idempotência das solicitações PIX
  Como cliente do FinBank
  Quero poder repetir uma solicitação com segurança
  Para que uma falha de comunicação não gere uma segunda transação

  Contexto:
    Dado que a conta "ACC-1001" está ativa
    E que existe saldo suficiente para a operação
    E que a chave PIX "11999999999" é válida
```

---

# CT32 | Primeira solicitação processada

Antes de testar repetição, precisamos estabelecer o comportamento normal.

```
  @CT32 @RF05 @EP @funcional @api @baseline
  Cenário: Processar uma solicitação com requestId inédito
    Dado que o "requestId" "REQ-20260818-0001" ainda não foi utilizado
    Quando eu enviar uma solicitação de PIX de "1500.00" reais
    Então a solicitação deve ser processada
    E a resposta deve possuir um "transactionId"
    E a resposta deve possuir o "requestId" "REQ-20260818-0001"
    E deve existir apenas uma transação associada ao "requestId"
```

### O que estamos garantindo?

```
requestId novo
      ↓
1 processamento
      ↓
1 transactionId
      ↓
1 transação
```

🟢 **Baseline**

---

# CT33 | Repetição da mesma solicitação

Esse é o coração da idempotência.

```
  @CT33 @RF05 @EP @funcional @api @target
  Cenário: Retornar o mesmo resultado ao repetir uma solicitação
    Dado que a solicitação "REQ-20260818-0002" já foi processada
    E que ela gerou a transação "PIX-88772"
    Quando eu enviar novamente a mesma solicitação com o mesmo "requestId"
    Então o sistema deve retornar o mesmo "transactionId" "PIX-88772"
    E nenhuma nova transação deve ser criada
    E nenhum novo débito deve ser realizado
```

Aqui temos a regra fundamental:

```
1ª chamada
REQ-0002
   ↓
PIX-88772

2ª chamada
REQ-0002
   ↓
PIX-88772
```

e **não**:

```
REQ-0002
   ├── PIX-88772
   └── PIX-88773 ❌
```

O RF-05 determina exatamente que solicitações repetidas não gerem mais de uma transação ou débito.

---

# CT34 | Duas chamadas simultâneas

Agora vamos para uma situação mais perigosa.

```
  @CT34 @RF05 @EP @funcional @api @target
  Cenário: Impedir processamento duplicado em chamadas simultâneas
    Dado que o "requestId" "REQ-20260818-0003" ainda não foi processado
    Quando duas solicitações simultâneas forem enviadas com o mesmo "requestId"
    Então ambas devem retornar o mesmo "transactionId"
    E somente uma transação deve ser criada
    E somente um débito deve ser realizado
```

Esse caso está diretamente no critério de aceite do RF-05.

### Técnica

**Particionamento de Equivalência**, considerando:

```
requestId único
requestId repetido
```

e também **teste baseado em experiência**, porque concorrência é uma fonte clássica de defeitos que testes sequenciais podem não revelar.

---

# CT35 | Retry após timeout

Esse é o cenário que eu colocaria como **um dos protagonistas do workshop**.

O protótipo já identifica exatamente esse risco: T05 permite "Tentar Novamente", mas existe a possibilidade de a primeira operação ter sido processada mesmo que o cliente não tenha recebido a resposta.

```
  @CT35 @RF05 @EP @funcional @api @target
  Cenário: Não duplicar transação após timeout
    Dado que a solicitação "REQ-20260818-0004" foi enviada
    E que o processamento da solicitação foi concluído no backend
    Mas a resposta não chegou ao cliente devido a um timeout
    Quando o cliente repetir a solicitação utilizando o mesmo "requestId"
    Então o sistema não deve criar uma nova transação
    E deve retornar o "transactionId" associado à solicitação original
    E nenhum débito adicional deve ser realizado
```

Esse cenário é maravilhoso para a dinâmica porque:

```
Cliente
   │
   │ PIX R$ 1.500
   ▼
Backend
   │
   ├── processa ✅
   │
   └── resposta perdida
          │
          ▼
       TIMEOUT
          │
          ▼
     "Tentar novamente"
          │
          ▼
      mesmo requestId
```

O sistema precisa entender:

> **"Eu não sei se o cliente recebeu minha resposta."**

e não:

> "Vou processar tudo novamente."

---

# CT36 | Mesmo requestId com conteúdo diferente

Agora temos uma classe de erro completamente diferente.

```
  @CT36 @RF05 @EP @funcional @api @target
  Cenário: Rejeitar reutilização do requestId com conteúdo diferente
    Dado que o "requestId" "REQ-20260818-0005" já foi utilizado para um PIX de "1500.00" reais
    Quando eu enviar uma nova solicitação utilizando o mesmo "requestId"
    Mas com valor de "2000.00" reais
    Então a nova solicitação deve ser rejeitada
    E a resposta deve indicar conflito de idempotência
    E nenhuma nova transação deve ser criada
    E o PIX original não deve ser alterado
```

O critério de aceite do RF-05 exige explicitamente **conflito quando o mesmo `requestId` é reutilizado com conteúdo diferente**.

Aqui temos uma partição muito interessante:

```
MESMO requestId

        ├── mesmo conteúdo
        │       ↓
        │   reutilização
        │   segura
        │
        └── conteúdo diferente
                ↓
             CONFLITO
```

---

# CT37 | Repetição após rejeição

Precisamos verificar o comportamento quando a primeira tentativa **não criou uma transação**.

```
  @CT37 @RF05 @EP @funcional @api @target
  Cenário: Permitir nova tentativa após uma solicitação rejeitada
    Dado que a solicitação "REQ-20260818-0006" foi rejeitada
    E que nenhuma transação foi criada
    Quando eu enviar uma nova solicitação válida
    Então a nova solicitação deve poder ser processada
    E deve existir uma transação correspondente à nova tentativa
```

⚠️ Aqui precisamos ter cuidado com o `requestId`.

O material determina que resultados que permitam nova tentativa devem informar isso inequivocamente por código de motivo.

Então **não vamos assumir automaticamente que o mesmo `requestId` pode ser reutilizado após uma rejeição**.

Essa é uma regra que precisa ser definida pelo domínio.

Portanto, eu marcaria esse cenário como:

🟡 **Regra a definir**

---

# CT38 | Repetição de uma operação em REVIEW

Agora temos outro estado.

```
  @CT38 @RF05 @EP @transicao-estado @funcional @api @target
  Cenário: Não criar uma segunda transação ao repetir uma operação em análise
    Dado que a solicitação "REQ-20260818-0007" está no estado "REVIEW"
    E que existe uma transação associada a esse requestId
    Quando eu repetir a solicitação utilizando o mesmo "requestId"
    Então nenhuma nova transação deve ser criada
    E o sistema deve retornar o estado atual da solicitação original
```

Esse caso conecta **idempotência + transição de estado**.

O PRD define `REVIEW` como operação aceita para análise, mas ainda não concluída financeiramente.

---

## Precondição do identificador

O servidor gera o `requestId` ao criar a intenção PIX. Por isso, a Feature 05 testa a repetição e o conflito desse identificador, não sua ausência no payload inicial.
