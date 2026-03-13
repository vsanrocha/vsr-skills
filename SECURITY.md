# Política de Segurança

## Filosofia

O vsr-skills é um catálogo **auditável em texto aberto**. Não incluímos binários, payloads opacos ou instruções que exfiltrem dados sem consentimento explícito.

## Trust Model

- **100% open source**: todo conteúdo é texto legível e auditável
- **Sem binários**: nenhum executável ou artefato compilado
- **Revisão humana**: itens novos passam por PR e checklist de segurança
- **Permissões documentadas**: cada plugin/skill declara o que acessa (rede, filesystem, etc.)

## O que não aceitamos

- Código ofuscado ou minificado
- Binários ou artefatos compilados
- Skills/plugins que acessem credenciais ou env vars sem documentação explícita
- Instruções que incentivem jailbreak ou bypass de guardrails

## Reportar vulnerabilidades

**Não abra issues públicas para vulnerabilidades.**

Use [GitHub Security Advisories](https://github.com/vsanrocha/vsr-skills/security/advisories/new) para reportar de forma privada.

Inclua: descrição, passos para reproduzir, componente afetado, impacto potencial.

Objetivo: reconhecer em até 48h e resolver em até 14 dias.
