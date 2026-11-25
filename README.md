# SysGuard – Linux Server Monitoring & Automated Recovery

![Linux](https://img.shields.io/badge/OS-Linux-orange?logo=linux)
![Shell](https://img.shields.io/badge/Language-Bash-green?logo=gnubash)
![Platform](https://img.shields.io/badge/Platform-Ubuntu-blue?logo=ubuntu)
![Project](https://img.shields.io/badge/Project-DevOps-purple)

## Overview

SysGuard is a Bash-based Linux server monitoring and automation project designed to monitor system resources, check critical services, recover failed services, automate backups, and generate system health reports.

The project demonstrates practical Linux administration, Bash scripting, system monitoring, scheduled automation, backup management, and service recovery.

## Features

- **CPU Monitoring:** Measures CPU utilization and checks configurable thresholds.
- **Memory Monitoring:** Tracks RAM utilization.
- **Disk Monitoring:** Checks filesystem usage and identifies high disk utilization.
- **Service Monitoring:** Monitors SSH and Nginx services.
- **Automatic Recovery:** Attempts to restart inactive critical services.
- **Automated Backups:** Creates timestamped compressed project backups.
- **Backup Retention:** Removes backup archives older than the configured retention period.
- **Log Management:** Records monitoring and backup activity.
- **Log Rotation:** Uses Linux logrotate to manage log files.
- **Health Reports:** Generates timestamped reports containing system metrics and service status.
- **Cron Scheduling:** Supports scheduled automated backups.

## Technologies Used

| Technology | Purpose |
|---|---|
| Ubuntu Linux | Operating environment |
| Bash | Automation and scripting |
| Linux commands | System monitoring |
| systemd | Service management |
| Nginx | Monitored web service |
| OpenSSH | Monitored SSH service |
| Cron | Scheduled backups |
| Logrotate | Log management |
| Tar and Gzip | Backup compression |
| Git and GitHub | Version control |

## Project Structure

```text
sysguard/
├── config/
│   └── sysguard.conf
├── scripts/
│   ├── sysguard.sh
│   ├── backup.sh
│   └── health-report.sh
├── logs/
├── backups/
├── reports/
├── docs/
├── README.md
└── .gitignore
```

## Configuration

Edit `config/sysguard.conf` to customize monitoring thresholds.

```bash
CPU_THRESHOLD=80
MEMORY_THRESHOLD=80
DISK_THRESHOLD=80

BACKUP_RETENTION_DAYS=7
BACKUP_DIR="backups"

LOG_FILE="logs/sysguard.log"

SERVICES=("ssh" "nginx")
```

## Installation

Clone the repository:

```bash
git clone https://github.com/nikhilyede/sysguard.git
cd sysguard
```

Make scripts executable:

```bash
chmod +x scripts/*.sh
```

Install the required utilities if they are not already installed:

```bash
sudo apt update
sudo apt install nginx openssh-server cron logrotate -y
```

## Usage

### 1. Run system monitoring

```bash
./scripts/sysguard.sh
```

### 2. Run automated backup

```bash
./scripts/backup.sh
```

### 3. Generate system health report

```bash
./scripts/health-report.sh
```

### 4. View monitoring logs

```bash
tail -f logs/sysguard.log
```

### 5. View generated backups

```bash
ls -lh backups/
```

### 6. View health reports

```bash
ls -lh reports/
```

## Automated Backup Scheduling

SysGuard supports scheduled backups through cron.

Example: Run a backup every day at 2:00 AM.

```cron
0 2 * * * /bin/bash /home/USER/sysguard/scripts/backup.sh >> /home/USER/sysguard/logs/cron-backup.log 2>&1
```

Replace `USER` with your Linux username.

## Log Rotation

SysGuard uses logrotate to manage monitoring and backup logs.

Configured policies include:

- Daily rotation
- Seven rotated copies
- Gzip compression
- Missing-file handling
- Empty-file exclusion

## Testing and Validation

The following tests were performed during development:

| Test | Result |
|---|---|
| CPU monitoring | Passed |
| RAM monitoring | Passed |
| Disk monitoring | Passed |
| SSH service monitoring | Passed |
| Nginx service monitoring | Passed |
| Nginx failure simulation | Passed |
| Automatic Nginx recovery | Passed |
| Backup archive creation | Passed |
| Backup archive inspection | Passed |
| Configuration file restoration | Passed |
| Log rotation | Passed |
| Health report generation | Passed |

## Environment

Developed and tested in Ubuntu running under Windows Subsystem for Linux (WSL).

**Note:** WSL must be running for its scheduled cron jobs to execute. The current backup script archives the SysGuard project itself; it does not yet back up the configured `/var/log` and `/var/www/html` source directories.

## Future Improvements

- Email notifications for critical alerts
- HTML-based health reports
- CPU and memory trend tracking
- Configurable service monitoring
- Configurable backup source directories
- Cloud backup integration with AWS S3
- Docker-based deployment
- Prometheus and Grafana integration

## Author

**Nikhil Yede**

Aspiring AWS and DevOps Engineer

GitHub: https://github.com/nikhilyede

Portfolio: https://nikhilyede.github.io/

---

*SysGuard – Monitor. Detect. Recover. Automate.*
