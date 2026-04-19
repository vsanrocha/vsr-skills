#!/usr/bin/env bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

DOCKER_COMMANDS="(^|&&|\|\||;)[[:space:]]*(php|composer|co-phpunit|phpstan|php-cs-fixer|vendor/bin/)([[:space:]]|$)"

if echo "$COMMAND" | grep -qE "(^|&&|\|\||;)[[:space:]]*(docker)[[:space:]]"; then
    exit 0
fi

if echo "$COMMAND" | grep -qE "$DOCKER_COMMANDS"; then
    echo "Comando requer o ambiente PHP do container." >&2
    echo "" >&2
    echo "Prefira os scripts do composer quando disponíveis:" >&2
    echo "  docker compose exec -T docker-name composer test      # rodar testes" >&2
    echo "  docker compose exec -T docker-name composer cs-fix    # corrigir estilo" >&2
    echo "  docker compose exec -T docker-name composer analyse   # phpstan" >&2
    echo "" >&2
    echo "Ou execute o comando diretamente:" >&2
    echo "  docker compose exec -T docker-name $COMMAND" >&2
    exit 2
fi

exit 0
