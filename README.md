# SysGuard — Linux Monitoring, Recovery & Operations Dashboard

![Linux](https://img.shields.io/badge/OS-Linux-orange?logo=linux)
![Bash](https://img.shields.io/badge/Language-Bash-green?logo=gnubash)
![Python](https://img.shields.io/badge/API-Python%20%2F%20Flask-blue?logo=python)
![Platform](https://img.shields.io/badge/Platform-Ubuntu-blue?logo=ubuntu)

SysGuard is a Linux monitoring and automation project with a browser-based operations dashboard. It monitors system resources, checks critical services, attempts service recovery, creates compressed backups, and generates health reports.

The project combines Bash scripting, Python/Flask, systemd, cron, and Linux administration.

## Features

- CPU, memory, and filesystem monitoring
- SSH and Nginx service monitoring
- Automatic recovery attempts for inactive monitored services
- Timestamped compressed project backups
- Configurable backup retention
- System health report generation
- Cron-based scheduled backups
- Log management and logrotate integration
- Local Flask dashboard agent
- One-time browser pairing and authenticated sessions
- Read-only public snapshot support
- CLI for common operations and agent management

## Dashboard

The dashboard provides six operational areas:

1. Overview
2. Monitor and Recovery
3. Backups
4. Health Report
5. Config and Usage
6. Tests and Roadmap

The local dashboard retrieves data from the user's Linux agent. Buttons that perform operations require an authenticated local connection.

A public static deployment can show a published read-only snapshot. GitHub Pages cannot execute scripts on a visitor's Linux system.

## Quick start

```bash
git clone https://github.com/nikhilyede/sysguard.git
cd sysguard

chmod +x install.sh
./install.sh

sysguard agent setup
sysguard agent pair
sysguard dashboard open
```

See [Installation Guide](docs/installation.md) for details.

## CLI commands

```bash
sysguard help
sysguard monitor
sysguard backup
sysguard report

sysguard agent status
sysguard agent start
sysguard agent stop
sysguard agent restart
sysguard agent pair

sysguard dashboard open
sysguard dashboard url
```

## Configuration

Edit `config/sysguard.conf` to configure monitoring thresholds and retention.

```bash
CPU_THRESHOLD=80
MEMORY_THRESHOLD=80
DISK_THRESHOLD=80
BACKUP_RETENTION_DAYS=7
SERVICES=("ssh" "nginx")
```

## Technology stack

| Technology | Purpose |
|---|---|
| Ubuntu Linux | Operating environment |
| Bash | Monitoring and automation |
| Python and Flask | Local dashboard API |
| Gunicorn | Dashboard application server |
| systemd | Agent service management |
| Cron | Scheduled backups |
| Logrotate | Log management |
| Tar and Gzip | Backup compression |
| HTML, CSS, JavaScript | Dashboard interface |
| Git and GitHub | Version control |

## Project structure

```text
sysguard/
├── config/
│   └── sysguard.conf
├── dashboard/
│   ├── agent/
│   ├── deploy/
│   └── web/
├── docs/
│   ├── architecture.md
│   └── installation.md
├── scripts/
│   ├── agent-pair
│   ├── backup.sh
│   ├── health-report.sh
│   └── sysguard.sh
├── sysguard
├── install.sh
└── README.md
```

## Backup scope

The current backup script archives the SysGuard project directory itself. It does not yet include the configured `/var/log` and `/var/www/html` source directories.

## Platform notes

Developed and tested on Ubuntu under Windows Subsystem for Linux 2. The local agent and scheduled tasks require the WSL distribution to be running.

## Documentation

- [Installation Guide](docs/installation.md)
- [System Architecture](docs/architecture.md)

## Author

**Nikhil Yede**
Aspiring AWS and DevOps Engineer

GitHub: https://github.com/nikhilyede

Portfolio: https://nikhilyede.github.io/

---

*SysGuard — Monitor. Detect. Recover. Automate.*
