#!/usr/bin/env bash
# SysGuard project backup with configurable retention.
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/config/sysguard.conf"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ERROR: Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# shellcheck source=/dev/null
source "$CONFIG_FILE"

BACKUP_DIR="$PROJECT_DIR/${BACKUP_DIR:-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/backup.log"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
BACKUP_FILE="sysguard_backup_$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"

log_message() {
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

echo "======================================"
echo "       SYSGUARD BACKUP SYSTEM"
echo "======================================"
echo "Project: $PROJECT_DIR"
echo "Retention: $RETENTION_DAYS days"
echo "Scope: SysGuard project directory"
echo

log_message "Backup process started"

if tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
    --exclude='./backups' \
    --exclude='./.git' \
    --exclude='./dashboard/agent/__pycache__' \
    -C "$PROJECT_DIR" .; then
    log_message "Backup created: $BACKUP_FILE"
    echo "Backup completed successfully."
    echo "Archive: $BACKUP_DIR/$BACKUP_FILE"
    echo "Size: $(du -h "$BACKUP_DIR/$BACKUP_FILE" | awk '{print $1}')"
else
    log_message "ERROR: Backup creation failed"
    exit 1
fi

find "$BACKUP_DIR" -type f -name 'sysguard_backup_*.tar.gz' \
    -mtime "+$RETENTION_DAYS" -print -delete |
while IFS= read -r removed; do
    log_message "Expired backup removed: $(basename "$removed")"
done

log_message "Backup process completed"
echo "Backup process completed."
