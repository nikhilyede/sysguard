
#!/bin/bash

# ==========================================
# SysGuard - Linux Server Monitoring Tool
# Version: 1.0
# ==========================================

# Enable safer Bash execution
set -Eeuo pipefail

# Find the project directory
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# Configuration file
CONFIG_FILE="$PROJECT_DIR/config/sysguard.conf"

# Check configuration file
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ERROR: Configuration file not found!"
    exit 1
fi

# Load configuration
source "$CONFIG_FILE"

# Resolve project-relative paths
BACKUP_DIR="$PROJECT_DIR/$BACKUP_DIR"
LOG_FILE="$PROJECT_DIR/$LOG_FILE"

# Create required directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# ==========================================
# Logging Function
# ==========================================

write_log() {

    local MESSAGE="$1"
    local TIMESTAMP

    TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

    echo "[$TIMESTAMP] $MESSAGE" | tee -a "$LOG_FILE"
}

# ==========================================
# Welcome Function
# ==========================================

welcome() {

    echo "======================================"
    echo "       SYSguard SERVER MONITOR"
    echo "======================================"

    echo "Project: $PROJECT_NAME"
    echo "Version: $VERSION"
    echo "CPU Threshold: $CPU_THRESHOLD%"
    echo "Memory Threshold: $MEMORY_THRESHOLD%"
    echo "Disk Threshold: $DISK_THRESHOLD%"
    echo "Backup Retention: $BACKUP_RETENTION_DAYS days"

    echo "======================================"
}


# ==========================================
# CPU Monitoring Function
# ==========================================


check_cpu() {

    echo ""
    echo "Checking CPU utilization..."

    # First CPU reading
    read -r total1 idle1 < <(
        awk '/^cpu / {
            total=0
            for (i=2; i<=9; i++)
                total += $i

            idle=$5+$6

            print total, idle
            exit
        }' /proc/stat
    )

    # Wait one second
    sleep 1

    # Second CPU reading
    read -r total2 idle2 < <(
        awk '/^cpu / {
            total=0
            for (i=2; i<=9; i++)
                total += $i

            idle=$5+$6

            print total, idle
            exit
        }' /proc/stat
    )

    # Calculate differences
    total_diff=$((total2 - total1))
    idle_diff=$((idle2 - idle1))

    # Calculate CPU percentage
    CPU_USAGE=$(awk \
        -v total="$total_diff" \
        -v idle="$idle_diff" \
        'BEGIN {
            if (total <= 0)
                print 0
            else
                printf "%.0f", (total-idle)/total*100
        }'
    )

    echo "CPU Usage: ${CPU_USAGE}%"

    if (( CPU_USAGE >= CPU_THRESHOLD )); then

        echo "WARNING: High CPU utilization!"
        write_log "WARNING: CPU usage is ${CPU_USAGE}%"

    else

        echo "CPU utilization is normal."
        write_log "CPU usage is ${CPU_USAGE}% - NORMAL"

    fi
}

# ==========================================
# RAM Monitoring Function
# ==========================================


check_memory() {

    echo ""
    echo "Checking RAM utilization..."

    # Read total and available memory
    local MEMORY_USAGE

    MEMORY_USAGE=$(free -b | awk '
        /^Mem:/ {
            if ($2 <= 0 || $7 == "")
                exit 1

            usage = (($2 - $7) / $2) * 100

            printf "%.0f", usage
        }
    ')

    # Validate memory calculation
    if [[ ! "$MEMORY_USAGE" =~ ^[0-9]+$ ]]; then

        echo "ERROR: Unable to calculate RAM utilization."

        write_log "ERROR: RAM monitoring failed"

        return 1

    fi

    # Display memory usage
    echo "RAM Usage: ${MEMORY_USAGE}%"

    # Compare with configured threshold
    if (( MEMORY_USAGE >= MEMORY_THRESHOLD )); then

        echo "WARNING: High RAM utilization!"

        write_log "WARNING: RAM usage is ${MEMORY_USAGE}%"

    else

        echo "RAM utilization is normal."

        write_log "RAM usage is ${MEMORY_USAGE}% - NORMAL"

    fi
}


# ==========================================
# Disk Monitoring Function
# ==========================================

check_disk() {

    echo ""
    echo "Checking disk utilization..."

    local FOUND_FILESYSTEM=0

    while IFS=$'\t' read -r DISK_USAGE MOUNT_POINT; do

        FOUND_FILESYSTEM=1

        echo "Filesystem: $MOUNT_POINT"
        echo "Disk Usage: ${DISK_USAGE}%"

        if (( DISK_USAGE >= DISK_THRESHOLD )); then

            echo "WARNING: High disk utilization on $MOUNT_POINT!"

            write_log "WARNING: Disk usage is ${DISK_USAGE}% on $MOUNT_POINT"

        else

            echo "Disk utilization is normal on $MOUNT_POINT."

            write_log "Disk usage is ${DISK_USAGE}% on $MOUNT_POINT - NORMAL"

        fi

    done < <(

    df -PT |
    
awk '
    NR > 1 {

        filesystem = $1
        type       = $2
        usage      = $6
        mount      = $7

        # Remove percentage symbol
        gsub("%", "", usage)

        # Exclude temporary filesystems
        if (type == "tmpfs") {
            next
        }

        if (type == "devtmpfs") {
            next
        }

        # Exclude read-only Snap images
        if (type == "squashfs") {
            next
        }

        # Exclude loop devices
        if (filesystem ~ /^\/dev\/loop/) {
            next
        }

        # Exclude WSL internal mounts
        if (mount ~ /^\/snap\//) {
            next
        }

        if (mount ~ /^\/usr\/lib\/wsl\//) {
            next
        }

        if (mount ~ /^\/mnt\/wsl/) {
            next
        }

        if (mount ~ /^\/init$/) {
            next
        }

        if (mount ~ /^\/usr\/lib\/modules\//) {
            next
        }

        # Display disk usage and mount point
        print usage "\t" mount
    }
'


)

    if (( FOUND_FILESYSTEM == 0 )); then

        echo "ERROR: No filesystems could be monitored."

        write_log "ERROR: Disk monitoring found no filesystems"

        return 1

    fi

    write_log "Disk monitoring completed"

}


# ==========================================
# Service Monitoring Function
# ==========================================

check_services() {

    echo ""
    echo "Checking critical services..."

    # Critical Linux services
    local SERVICES=("ssh" "nginx")

    local SERVICE
    local STATUS

    for SERVICE in "${SERVICES[@]}"; do

        echo ""
        echo "Checking service: $SERVICE"

        # Check service status
        if systemctl is-active --quiet "$SERVICE"; then

            echo "$SERVICE service is running."

            write_log "$SERVICE service is ACTIVE - NORMAL"

        else

            echo "WARNING: $SERVICE service is not running!"

            write_log "WARNING: $SERVICE service is DOWN"

            echo "Attempting to restart $SERVICE..."

            # Attempt automatic recovery
            if sudo systemctl restart "$SERVICE"; then

                # Verify service recovery
                if systemctl is-active --quiet "$SERVICE"; then

                    echo "$SERVICE restarted successfully."

                    write_log "$SERVICE restarted successfully - RECOVERED"

                else

                    echo "ERROR: $SERVICE restart verification failed."

                    write_log "ERROR: $SERVICE restart verification failed"

                fi

            else

                echo "ERROR: Unable to restart $SERVICE."

                write_log "ERROR: Failed to restart $SERVICE"

            fi

        fi

    done

    write_log "Service monitoring completed"

}



# ==========================================
# Main Function
# ==========================================

main() {

    welcome

    write_log "SysGuard execution started"

    write_log "Configuration loaded successfully"

    write_log "Monitoring initialization completed"

    check_cpu

    write_log "CPU monitoring completed"

    check_memory

    write_log "RAM monitoring completed"

    check_disk

    check_services
}

main
