FROM node:22-bookworm

# Install system dependencies
RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# Build-args for UID/GID alignment: sandcastle docker build-image
# defaults these to the host user's UID/GID so image-built files
# and bind-mounted files share an owner without runtime chown.
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Rename the base image's "node" user to "agent" and align UID/GID.
# macOS hosts use GID 20 (`staff`), which collides with Debian's pre-existing
# `games` group. If the requested GID is already taken by some other group,
# bump that group out of the way first, then assign it to `node`.
RUN if getent group "$AGENT_GID" >/dev/null; then \
      conflict_name=$(getent group "$AGENT_GID" | cut -d: -f1); \
      if [ "$conflict_name" != "node" ]; then \
        groupmod -g 9999 "$conflict_name"; \
      fi; \
    fi && \
    groupmod -g $AGENT_GID node && \
    usermod -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude to PATH
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# Sandcastle bind-mounts the git worktree at the sandbox repo dir
# and overrides the working directory at container start.
ENTRYPOINT ["sleep", "infinity"]
