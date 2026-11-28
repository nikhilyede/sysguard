# SysGuard Installation Guide

## Requirements

- Linux system with systemd
- Bash
- Python 3 and Python venv support
- pip
- sudo privileges for system service installation

Ubuntu and Debian-based distributions are the primary tested environments.

## 1. Clone the repository

```bash
git clone https://github.com/nikhilyede/sysguard.git
cd sysguard
```

## 2. Install the SysGuard command

```bash
chmod +x install.sh
./install.sh
```

The installer creates a command link at `/usr/local/bin/sysguard`.

## 3. Configure the local dashboard agent

```bash
sysguard agent setup
```

This command:

- Creates a Python virtual environment.
- Installs the dashboard dependencies.
- Generates authentication secrets if they do not already exist.
- Stores secrets in the user's private configuration directory.
- Creates and enables the systemd dashboard service.
- Binds the API to localhost on port 8765.

The setup command requires administrator permission to install the systemd unit.

## 4. Pair a browser

```bash
sysguard agent pair
```

Enter the one-time pairing code in the local dashboard at:

http://127.0.0.1:8765

The code expires after five minutes and can only be used once. Do not share it.

## 5. Open the dashboard

```bash
sysguard dashboard open
```

Or visit:

http://127.0.0.1:8765

## CLI reference

| Command | Purpose |
|---|---|
| `sysguard help` | Show CLI help |
| `sysguard version` | Show version |
| `sysguard monitor` | Run Linux monitoring and recovery |
| `sysguard backup` | Create a project backup |
| `sysguard report` | Generate a health report |
| `sysguard agent setup` | Install/configure the dashboard agent |
| `sysguard agent status` | Check agent service status |
| `sysguard agent start` | Start the agent |
| `sysguard agent stop` | Stop the agent |
| `sysguard agent restart` | Restart the agent |
| `sysguard agent pair` | Generate a browser pairing code |
| `sysguard dashboard open` | Open the local dashboard |
| `sysguard dashboard url` | Print the dashboard URL |

## Service management

The dashboard runs as a systemd service:

```bash
sudo systemctl status sysguard-dashboard
sudo systemctl restart sysguard-dashboard
sudo journalctl -u sysguard-dashboard -f
```

## Security

- The local dashboard API binds to `127.0.0.1`.
- Browser pairing codes are single-use and expire after five minutes.
- Authentication secrets are stored in the user's configuration directory with restrictive permissions.
- Do not commit environment files, tokens, pairing codes, or private logs.
- Do not expose the dashboard port directly to the public internet.

## WSL notes

Under WSL, systemd must be enabled and the distribution must be running for the service to operate. Shutting down WSL stops the local agent until the distribution starts again.

## Public dashboard

A static GitHub Pages deployment can display a published read-only snapshot. It cannot execute scripts on a user's Linux machine. Actual monitoring actions and administrative operations require that user's own local agent.
