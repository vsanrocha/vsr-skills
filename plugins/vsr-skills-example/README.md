# vsr-skills-example

Plugin de exemplo para Claude Code, pronto para marketplace.

## Instalação

```bash
# Via marketplace (quando registrado)
/plugin install vsr-skills-example@vsr-skills-marketplace

# Local (desenvolvimento)
claude --plugin-dir ./plugins/vsr-skills-example
```

## Permissões

- **Rede:** não
- **Filesystem:** read-only (apenas leitura de contexto)
- **Revisado:** sim

## Estrutura

```
vsr-skills-example/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── hello/
│       └── SKILL.md
└── README.md
```
