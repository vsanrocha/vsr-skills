# vsr-skills

Catálogo público de skills, plugins, hooks e rules para agentes de código. **Foco principal: Claude Code**, com compatibilidade para Cursor, Codex, Antigravity e outros.

## Quick Start (Claude Code)

### Instalar via repositório

```bash
# Registrar este repositório como marketplace e instalar o plugin principal
/plugin marketplace add vsanrocha/vsr-skills
/plugin install vsr-skills@vsr-skills-marketplace
```

### Instalar skills diretamente

Se você usa Claude Code com skills em `.claude/skills/`, pode clonar ou copiar as skills:

```bash
git clone https://github.com/vsanrocha/vsr-skills.git
cp -r vsr-skills/skills/* ~/.claude/skills/
# ou para o projeto atual:
cp -r vsr-skills/skills/* .claude/skills/
```

### Via npx skills (multi-agente)

```bash
npx skills add vsanrocha/vsr-skills -a claude-code
```

## Estrutura

| Diretório | Conteúdo |
|-----------|----------|
| `skills/` | Skills reutilizáveis (SKILL.md) |
| `plugins/` | Plugins empacotados para Claude Code |
| `hooks/` | Hooks de automação |
| `rules/` | Rules por agente/editor |

## Compatibilidade

| Agente | Tier | Instalação |
|--------|------|------------|
| **Claude Code** | 1 | Plugin marketplace, repositório, `.claude/skills/` |
| Cursor | 2 | `.cursor/skills/`, npx skills |
| Codex | 2 | `.codex/skills/`, npx skills |
| Antigravity | 2 | `.gemini/antigravity/skills/`, npx skills |

## Segurança

- Catálogo 100% em texto aberto, sem binários.
- Cada item documenta permissões e limitações.
- Consulte [SECURITY.md](SECURITY.md) para política de vulnerabilidades.

## Contribuir

Veja [CONTRIBUTING.md](CONTRIBUTING.md) para padrões e fluxo de contribuição.

## Licença

MIT — veja [LICENSE](LICENSE).
