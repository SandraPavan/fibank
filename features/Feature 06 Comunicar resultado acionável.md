## Objetivo

Garantir que o resultado da operação seja:

- correto;
- compreensível;
- acionável;
- rastreável;
- seguro.

A pergunta da feature é:

> **"O sistema informou o resultado. Mas o usuário sabe o que fazer agora?"**

---

# Técnicas CTFL

Aqui vamos combinar:

- **Particionamento de Equivalência**
- **Tabela de Decisão**
- **Transição de Estado**
- **Suposição de Erro**

A **Tabela de Decisão** ganha bastante importância porque temos diferentes combinações entre resultado técnico, estado da transação e ação permitida.

---

# Estados que precisamos distinguir

O domínio define:

```
APPROVED
REVIEW
REJECTED
FAILED
```

E existe uma diferença importantíssima:

```
UNKNOWN
```

`UNKNOWN` **não é um estado persistido da transação**. É o estado percebido pelo cliente quando ele não recebeu a resposta.

Portanto:

```
Backend:
APPROVED

Cliente:
UNKNOWN
```

pode acontecer simultaneamente.

Isso será fundamental nos nossos testes.

---

# `comunicacao-resultado.feature`

```
# language: pt

@feature-comunicacao-resultado
Funcionalidade: Comunicar resultado acionável da operação PIX
  Como cliente do FinBank
  Quero receber uma informação clara sobre o resultado da minha operação
  Para saber se devo aguardar, corrigir os dados ou tentar novamente
```

---

# CT40 | PIX aprovado

Primeiro, o caminho feliz.

```
  @CT40 @RF06 @EP @funcional @api @baseline
  Cenário: Comunicar uma operação PIX aprovada
    Dado que a transação foi concluída com sucesso
    E possui o status "APPROVED"
    Quando o resultado da operação for apresentado ao cliente
    Então o cliente deve ser informado de que o PIX foi concluído
    E deve receber o "transactionId"
    E deve receber o "requestId"
    E não deve ser orientado a tentar novamente
```

Esse cenário conversa com a regra de que o comprovante só deve aparecer após uma conclusão inequívoca.

🟢 **Baseline**

---

# CT41 | Transação em análise

Agora `REVIEW`.

```
  @CT41 @RF06 @EP @transicao-estado @funcional @api @baseline
  Cenário: Comunicar que a transação está em análise
    Dado que a transação possui o status "REVIEW"
    Quando o resultado for apresentado ao cliente
    Então o cliente deve ser informado de que a operação está em análise
    E não deve ser apresentada como concluída
    E não deve ser apresentada como rejeitada
    E o cliente deve receber orientação para aguardar
```

Esse ponto é explicitamente importante no PRD: `REVIEW` significa que a operação foi aceita para análise, mas **ainda não foi concluída financeiramente**.

---

# CT42 | Transação rejeitada

```
  @CT42 @RF06 @EP @funcional @api @baseline
  Cenário: Comunicar uma transação rejeitada
    Dado que a transação possui o status "REJECTED"
    E possui um código de motivo
    Quando o resultado for apresentado ao cliente
    Então o cliente deve ser informado de que a operação foi rejeitada
    E a resposta deve conter um código de motivo
    E o cliente deve receber orientação sobre a próxima ação permitida
    E não deve ser apresentado um comprovante de sucesso
```

Aqui precisamos tomar cuidado com uma coisa:

**motivo técnico interno ≠ explicação antifraude detalhada.**

O RF-06 determina que as mensagens não exponham regras sensíveis do antifraude.

Então não queremos:

> "Sua transação foi rejeitada porque o dispositivo novo + horário incomum + frequência elevada ultrapassaram o score X."

Isso seria praticamente entregar o mapa do tesouro para quem quer burlar o sistema. 🗺️

Queremos algo acionável e seguro.

---

# CT43 | Erro recuperável

Agora entramos em erro técnico.

```
  @CT43 @RF06 @EP @funcional @api @target
  Cenário: Comunicar erro recuperável permitindo nova tentativa segura
    Dado que ocorreu uma falha técnica recuperável
    E que a operação não foi concluída
    Quando o resultado for apresentado ao cliente
    Então o cliente deve ser informado de que ocorreu uma falha temporária
    E deve ser orientado sobre a possibilidade de tentar novamente
    E a resposta deve informar um código de referência
```

A palavra importante aqui é:

**segura**.

Não basta colocar:

```
[Tentar novamente]
```

Precisamos saber se é seguro repetir.

---

# CT44 | Erro não recuperável

```
  @CT44 @RF06 @EP @funcional @api @target
  Cenário: Comunicar erro não recuperável sem orientar retry indevido
    Dado que ocorreu uma falha não recuperável
    Quando o resultado for apresentado ao cliente
    Então o cliente deve ser informado de que a operação não pode prosseguir
    E deve receber orientação para corrigir a situação ou buscar atendimento
    E não deve ser orientado a repetir automaticamente a operação
```

Aqui usamos EP:

```
erro recuperável
        vs
erro não recuperável
```

São comportamentos diferentes.

---

# CT45 | Timeout

Esse é **um dos casos mais importantes da Feature 06**.

O RF-06 diz explicitamente:

> timeout não deve ser apresentado como rejeição definitiva.

Então:

```
  @CT45 @RF06 @EP @transicao-estado @resiliencia @api @target
  Cenário: Comunicar resultado desconhecido após timeout
    Dado que o cliente enviou uma solicitação de PIX
    E que o backend ainda não retornou uma resposta
    Quando ocorrer um timeout no cliente
    Então o cliente deve ser informado de que não foi possível confirmar o resultado
    E a operação não deve ser apresentada como rejeitada
    E a operação não deve ser apresentada como concluída
    E o cliente deve ser orientado a consultar o estado da solicitação
```

Esse teste é especialmente importante porque o protótipo identifica como problema o fato de T05 afirmar que a transação não foi concluída **antes de confirmar o estado no backend**.

---

# CT46 | Backend concluiu, cliente recebeu timeout

Agora vamos juntar comunicação + idempotência.

```
  @CT46 @RF06 @RF05 @transicao-estado @resiliencia @api @target
  Cenário: Recuperar resultado após timeout quando a operação já foi concluída
    Dado que o backend concluiu a operação com status "APPROVED"
    E que a resposta não chegou ao cliente
    Quando o cliente consultar o estado utilizando o "requestId"
    Então o sistema deve informar que a operação foi concluída
    E deve retornar o "transactionId" original
    E o cliente deve ser direcionado ao comprovante
    E não deve ser solicitada uma nova execução da operação
```

Esse cenário está diretamente alinhado ao requisito adicional `RP-07`: antes de permitir nova tentativa, o sistema deve consultar o `requestId`; se a operação já foi concluída, o usuário deve ser direcionado ao comprovante.

---

# CT47 | Backend ainda processando

Agora temos o terceiro caminho do timeout.

```
  @CT47 @RF06 @transicao-estado @resiliencia @api @target
  Cenário: Informar que a operação ainda está sendo processada após timeout
    Dado que o cliente perdeu a resposta da solicitação
    E que o backend ainda está processando a operação
    Quando o cliente consultar o estado utilizando o "requestId"
    Então o sistema deve informar que a operação ainda está em processamento
    E o cliente deve ser orientado a aguardar
    E não deve ser criada uma nova transação
```

Temos então:

```
TIMEOUT
   │
   ▼
CONSULTAR requestId
   │
   ├── APPROVED ──► comprovante
   │
   ├── PROCESSING ─► aguardar
   │
   └── REJECTED ──► informar rejeição
```

Essa é uma excelente aplicação de **Transição de Estado**.

---

# CT48 | Detalhes do erro

O protótipo prevê que "Ver Detalhes do Erro" apresente **código de referência, estado da operação e próxima ação segura**, sem expor detalhes internos do antifraude.

```
  @CT48 @RF06 @EP @funcional @api @baseline
  Cenário: Exibir detalhes acionáveis de um erro
    Dado que ocorreu um erro durante o processamento
    Quando o cliente solicitar os detalhes do erro
    Então deve ser apresentado um código de referência
    E deve ser apresentado o estado da operação
    E deve ser apresentada a próxima ação segura
    E não devem ser exibidas regras internas do antifraude
    E não deve ser exibido o "riskScore"
```

---

# CT49 | Não expor informações sensíveis

Esse é um cenário de **segurança da informação**, embora esteja dentro da Feature 06.

```
  @CT49 @RF06 @EP @seguranca @api @baseline
  Cenário: Não expor informações sensíveis na comunicação do resultado
    Quando uma operação for rejeitada por uma regra de risco
    Então a resposta não deve expor regras internas do antifraude
    E não deve expor o "riskScore" ao cliente
    E não deve expor dados técnicos internos desnecessários
```

O contrato interno possui `riskScore`, mas a experiência do cliente não precisa revelar esse dado.

---

# CT50 | Resultado sempre correlacionável

Toda resposta deve possuir `requestId`, segundo o contrato funcional.

```
  @CT50 @RF06 @RF07 @EP @funcional @api @baseline
  Esquema do Cenário: Resultado deve ser correlacionável
    Dado que uma operação terminou com o status "<status>"
    Quando o resultado for retornado
    Então a resposta deve possuir o "requestId"
    E quando existir uma transação criada
    Então a resposta deve possuir o "transactionId"

    Exemplos:
      | status    |
      | APPROVED  |
      | REVIEW    |
      | REJECTED  |
```

Aqui começamos a fazer uma ponte com a Feature 07, que será justamente sobre **evidências operacionais**.
