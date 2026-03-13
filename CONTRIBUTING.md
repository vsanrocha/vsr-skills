# Contribuindo

Obrigado por considerar contribuir com o vsr-skills.

## Como contribuir

1. **Fork** o repositório
2. **Crie uma branch** para sua alteração (`git checkout -b feat/minha-skill`)
3. **Adicione ou edite** skills/plugins/hooks/rules seguindo as convenções abaixo
4. **Valide** localmente: `bun run validate`
5. **Commit** com mensagem clara (`feat: add skill X`, `fix: update plugin Y`)
6. **Push** e abra um **Pull Request**

## Convenções

### Skills

- Cada skill vive em `skills/<nome-da-skill>/`
- Obrigatório: `SKILL.md` com frontmatter YAML (`name`, `description`)
- Opcional: `references/`, `templates/` para assets auxiliares

### Plugins (Claude Code)

- Cada plugin vive em `plugins/<nome-do-plugin>/`
- Obrigatório: `.claude-plugin/plugin.json` com `name`, `description`, `version`
- Skills do plugin em `plugins/<nome>/skills/`
- README.md com instalação e permissões

### Hooks e Rules

- Hooks em `hooks/<nome>/` com `hooks.json` e README
- Rules em `rules/<agente>/` com arquivos de regra e README

## Checklist de PR

- [ ] Arquivos obrigatórios presentes
- [ ] Metadados válidos (frontmatter, plugin.json)
- [ ] README com instalação e uso
- [ ] Sem binários ou payloads opacos
- [ ] `bun run validate` passa

## Dúvidas

Abra uma [issue](https://github.com/vsanrocha/vsr-skills/issues) para discutir.
