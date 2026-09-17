# Features e matrizes de teste

Esta pasta detalha os casos de teste derivados de RF-01 a RF-07. Ela complementa o [PRD](../docs/PRD.md) e a documentação de desenvolvimento, mas não redefine o escopo do produto.

## Ordem de precedência

Quando houver divergência entre documentos, usar esta ordem:

1. [PRD](../docs/PRD.md), para requisitos e critérios de aceite;
2. [escopo e princípios didáticos](../dev/01-escopo-e-principios.md), para separar `baseline`, `reveal` e `target`;
3. [controle didático](../dev/05-controle-didatico.md), para as falhas intencionais D01–D06;
4. arquivo `Feature NN`, para o comportamento detalhado dos casos;
5. arquivo `Matriz Feature N`, como índice dos casos da feature;
6. [Resumo](Resumo.md), como visão consolidada.

Se uma decisão de domínio continuar aberta, o caso permanece parcial e não deve ser marcado como aprovado.

## Estados usados nas matrizes

| Estado            | Significado                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 🟢 Especificado   | O caso possui comportamento esperado suficiente para implementação ou automação. Não significa, isoladamente, que passe no baseline. |
| 🟡 Regra pendente | Existe caso, mas uma decisão de domínio impede uma expectativa definitiva.                                                           |
| 🔴 Caracterização | O caso reproduz uma falha intencional do baseline e fica na suíte reservada.                                                         |
| 🔵 Target         | O caso descreve a solução-alvo e pode falhar no baseline.                                                                            |

As tags Gherkin devem refletir a suíte de execução:

- `@baseline`: comportamento que deve passar na suíte pública;
- `@characterization`: evidência reservada que confirma uma falha D01–D06;
- `@target`: contrato da solução-alvo, executado separadamente.

## Mapa dos artefatos

| Requisito | Feature      | Matriz                      | Incidentes relacionados                      |
| --------- | ------------ | --------------------------- | -------------------------------------------- |
| RF-01     | `Feature 01` | `Matriz Cenários Feature 1` | —                                            |
| RF-02     | `Feature 02` | `Matriz Cenários Feature 2` | —                                            |
| RF-03     | `Feature 03` | `Matriz Feature 3`          | falso positivo de novo dispositivo (RISK-06) |
| RF-04     | `Feature 04` | `Matriz Feature 4`          | GAP01 e GAP02                                |
| RF-05     | `Feature 05` | `Matriz Feature 5`          | GAP03                                        |
| RF-06     | `Feature 06` | `Matriz Feature 6`          | GAP04 e GAP05                                |
| RF-07     | `Feature 07` | `Matriz Feature 7`          | GAP06, GAP07 e GAP08                         |

## Regra de manutenção

Ao criar, remover ou renumerar um CT/GAP, atualizar no mesmo conjunto de mudança:

- a feature;
- a matriz da feature;
- o `Resumo.md`;
- `dev/13-rastreabilidade.md`, quando a alteração afetar histórias, fluxos ou suites.
