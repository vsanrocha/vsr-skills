FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    jq \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd --create-home --shell /bin/bash agent

# Install Claude Code CLI as root, then make accessible to agent
RUN curl -fsSL https://claude.ai/install.sh | bash

# Switch to agent user for workspace
USER agent
WORKDIR /home/agent/workspace

ENTRYPOINT ["sleep", "infinity"]
