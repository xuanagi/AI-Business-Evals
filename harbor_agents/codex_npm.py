"""Codex adapter for networks where raw.githubusercontent.com is unavailable.

Harbor's built-in Codex installer uses NVM on glibc-based images.  This adapter
keeps the built-in Codex execution and trajectory conversion behavior, but
installs the CLI with the image's existing Node.js/npm toolchain instead.
"""

import shlex
from typing import override

from harbor.agents.installed.codex import Codex
from harbor.environments.base import BaseEnvironment


class CodexNpm(Codex):
    """Install Codex directly with npm, without downloading NVM from GitHub."""

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        if await self._installed_codex_satisfies_version(environment):
            self.logger.debug("Codex is already available at the requested version")
            return

        await self.ensure_system_dependencies(
            environment, ("curl", "bash", "nodejs", "npm", "ripgrep")
        )
        version_spec = f"@{self._version}" if self._version else "@latest"
        package_spec = shlex.quote(f"@openai/codex{version_spec}")
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                f"npm install --global {package_spec} && "
                "codex --version"
            ),
        )

        await self.exec_as_root(
            environment,
            command=(
                "for bin in node codex; do "
                'BIN_PATH="$(which "$bin" 2>/dev/null || true)"; '
                'if [ -n "$BIN_PATH" ] && [ "$BIN_PATH" != "/usr/local/bin/$bin" ]; then '
                'ln -sf "$BIN_PATH" "/usr/local/bin/$bin"; '
                "fi; done"
            ),
        )
