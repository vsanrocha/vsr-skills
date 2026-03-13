---
name: debug-checklist
description: Checklist sistemático para debugar bugs. Use ao investigar falhas, testes quebrados ou comportamento inesperado.
---

# Debug Checklist

Antes de propor correção:

1. **Reproduzir** — o bug ocorre de forma consistente? Em qual ambiente?
2. **Isolar** — qual é o menor input/cenário que reproduz?
3. **Rastrear** — stack trace, logs, breakpoints. Onde falha exatamente?
4. **Hipótese** — qual a causa provável? Teste com mudança mínima.
5. **Verificar** — a correção resolve sem regressões?

Documente o que foi tentado e o resultado antes de pedir ajuda.
