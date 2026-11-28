#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$PROJECT_DIR/sysguard" ]]; then
    echo "ERROR: SysGuard CLI was not found."
    exit 1
fi

chmod +x "$PROJECT_DIR/sysguard"
chmod +x "$PROJECT_DIR/scripts/"*.sh
chmod +x "$PROJECT_DIR/scripts/agent-pair"

echo "Installing the SysGuard command..."
sudo ln -sfn "$PROJECT_DIR/sysguard" /usr/local/bin/sysguard

echo
echo "Installation complete."
echo
echo "Next steps:"
echo "  sysguard agent setup"
echo "  sysguard agent pair"
echo "  sysguard dashboard open"
echo
echo "The agent setup command installs its Python environment"
echo "and configures the local systemd service."
