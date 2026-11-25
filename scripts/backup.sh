
#!/bin/bash

# ==========================================
# SysGuard Automated Backup System
# Version: 1.0
# ==========================================

# Project directories
PROJECT_DIR="$HOME/sysguard"
SOURCE_DIR="$PROJECT_DIR"
BACKUP_DIR="$PROJECT_DIR/backups"

# Backup configuration
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

BACKUP_FILE="sysguard_backup_$TIMESTAMP.tar.gz"

# ==========================================
# Logging Function
# ==========================================

log_message() {

    local MESSAGE="$1"
    local TIMESTAMP

    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$TIMESTAMP] $MESSAGE" | tee -a "$PROJECT_DIR/logs/backup.log"
}

# ==========================================
# Backup Function
# ==========================================

create_backup() {

    echo ""
    echo "======================================"
    echo "       SYSGUARD BACKUP SYSTEM"
    echo "======================================"

    mkdir -p "$BACKUP_DIR"
    mkdir -p "$PROJECT_DIR/logs"

    echo "Starting backup..."

    log_message "Backup process started"

    if tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
        --exclude='./backups' \
        --exclude='./.git' \
        -C "$PROJECT_DIR" .; then

        echo "Backup completed successfully!"

        log_message "Backup created: $BACKUP_FILE"

        echo "Backup location:"
        echo "$BACKUP_DIR/$BACKUP_FILE"

    else

        echo "ERROR: Backup failed!"

        log_message "ERROR: Backup creation failed"

        return 1

    fi
}

# ==========================================
# Backup Retention
# ==========================================

cleanup_old_backups() {

    echo ""
    echo "Cleaning old backups..."

    find "$BACKUP_DIR" \
        -type f \
        -name "sysguard_backup_*.tar.gz" \
        -mtime +"$RETENTION_DAYS" \
        -delete

    log_message "Old backups older than $RETENTION_DAYS days removed"

    echo "Backup cleanup completed."
}

# ==========================================
# Main Execution
# ==========================================

create_backup || exit 1

cleanup_old_backups

echo ""
echo "SysGuard backup process completed!"
