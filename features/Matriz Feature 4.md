| ID    | Cenário                        | Técnica           | Tipo                 | Nível | Status            |
| ----- | ------------------------------ | ----------------- | -------------------- | ----- | ----------------- |
| CT24  | Comportamento normal           | EP                | Funcional            | API   | 🔵 Target         |
| CT25  | Frequência elevada             | EP                | Funcional            | API   | 🔵 Target         |
| CT26  | Soma acumulada                 | EP                | Funcional            | API   | 🔵 Target         |
| CT27  | Janela temporal                | EP                | Funcional            | API   | 🔵 Target         |
| CT28  | Fronteira temporal             | BVA               | Funcional            | API   | 🟡 Regra pendente |
| CT29  | Dispositivo novo               | EP                | Funcional            | API   | 🔵 Target         |
| CT30  | Destinatário recente           | EP                | Funcional            | API   | 🔵 Target         |
| CT31  | Combinação de sinais           | Tabela de Decisão | Funcional            | API   | 🟡 Regra pendente |
| CT63  | Horário incomum                | EP                | Funcional            | API   | 🔵 Target         |
| GAP01 | 10 × R$ 4.900                  | Experiência + BVA | Segurança/Antifraude | API   | 🔴 Caracterização |
| GAP02 | Múltiplos PIX abaixo do limite | EP + Experiência  | Segurança/Antifraude | API   | 🔴 Caracterização |

---

# 6. O que essa feature revela

Agora nossa suíte começa a ter uma estrutura muito interessante:

```
FEATURE 01
Validação
        ↓
"Os dados são válidos?"

FEATURE 02
Saldo e limite
        ↓
"Tenho recurso para fazer isso?"

FEATURE 03
Risco da transação
        ↓
"Esta transação isoladamente parece suspeita?"

FEATURE 04
Comportamento recente
        ↓
"Esta sequência de operações faz sentido?"
```

E aí aparece a grande lacuna:

### O sistema pode ter:

```
CT01 → PASSOU
CT02 → PASSOU
CT03 → PASSOU
...
CT31 → CONTRATO TARGET
```

e ainda assim:

```
10 × R$ 4.900
       ↓
     FRAUDE
       ↓
   NÃO DETECTADA
```

Isso conversa diretamente com a proposta do workshop: mostrar que uma suíte com muitos testes passando ainda pode deixar **riscos críticos sem cobertura**.

---

## Uma correção estratégica importante

Eu **não colocaria `GAP01` e `GAP02` dentro da mesma execução da suíte baseline**.

Vamos ter três estados conceituais:

```
BASELINE
🟢 testes existentes
🟢 execução verde

INCIDENTE
🔴 comportamento real
🔴 falha de cobertura

EVOLUÇÃO
🟡 novos cenários
🟢 depois da implementação da regra
```

Assim, no workshop, o participante consegue experimentar a descoberta de verdade.

E a Feature 04 vira o ponto onde a frase **"187 testes passaram"** deixa de significar **"está tudo coberto"**.
