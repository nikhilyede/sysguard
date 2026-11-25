
#!/bin/bash

# ==========================================
# SysGuard - System Health Report
# ==========================================

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/config/sysguard.conf"

if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ERROR: Configuration file not found!"
    exit 1
fi

source "$CONFIG_FILE"

REPORT_DIR="$PROJECT_DIR/reports"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
REPORT_FILE="$REPORT_DIR/health_report_$TIMESTAMP.txt"

mkdir -p "$REPORT_DIR"

# ------------------------------------------
# Report Header
# ------------------------------------------

{
    echo "=========================================="
    echo "          SYSGUARD HEALTH REPORT"
    echo "=========================================="
    echo "Project       : $PROJECT_NAME"
    echo "Version       : $VERSION"
    echo "Hostname      : $(hostname)"
    echo "Generated     : $(date '+%Y-%m-%d %H:%M:%S')"
    echo "Operating System: $(. /etc/os-release && echo "$PRETTY_NAME")"
    echo "=========================================="

    # --------------------------------------
    # CPU Usage
    # --------------------------------------

    echo ""
    echo "CPU HEALTH"
    echo "------------------------------------------"

    read -r total1 idle1 < <(
        awk '/^cpu / {
            total=0
            for (i=2; i<=9; i++) total += $i
            print total, $5+$6
            exit
        }' /proc/stat
    )

    sleep 1

    read -r total2 idle2 < <(
        awk '/^cpu / {
            total=0
            for (i=2; i<=9; i++) total += $i
            print total, $5+$6
            exit
        }' /proc/stat
    )

    total_diff=$((total2-total1))
    idle_diff=$((idle2-idle1))

    CPU_USAGE=$(awk -v total="$total_diff" -v idle="$idle_diff" \
        'BEGIN {
            if (total <= 0) print 0
            else printf "%.0f", (total-idle)/total*100
        }')

    echo "CPU Usage: ${CPU_USAGE}%"

    if (( CPU_USAGE >= CPU_THRESHOLD )); then
        echo "Status: WARNING - High CPU usage"
    else
        echo "Status: NORMAL"
    fi

    # --------------------------------------
    # Memory Usage
    # --------------------------------------

    echo ""
    echo "MEMORY HEALTH"
    echo "------------------------------------------"

    MEMORY_USAGE=$(free -b | awk '/^Mem:/ {
        if ($2 > 0) printf "%.0f", (($2-$7)/$2)*100
    }')

    if [[ "$MEMORY_USAGE" =~ ^[0-9]+$ ]]; then
        echo "RAM Usage: ${MEMORY_USAGE}%"

        if (( MEMORY_USAGE >= MEMORY_THRESHOLD )); then
            echo "Status: WARNING - High RAM usage"
        else
            echo "Status: NORMAL"
        fi
    else
        echo "Status: ERROR - Unable to calculate RAM usage"
    fi

    # --------------------------------------
    # Disk Usage
    # --------------------------------------

    echo ""
    echo "DISK HEALTH"
    echo "------------------------------------------"

    df -PT | awk -v threshold="$DISK_THRESHOLD" '
        NR > 1 {
            filesystem=$1
            type=$2
            usage=$6
            mount=$7

            gsub("%", "", usage)

            if (type == "tmpfs" || type == "devtmpfs" ||
                type == "squashfs" || filesystem ~ /^\/dev\/loop/ ||
                mount ~ /^\/snap\// || mount ~ /^\/usr\/lib\/wsl\// ||
                mount ~ /^\/mnt\/wsl/ || mount == "/init" ||
                mount ~ /^\/usr\/lib\/modules\//) next

            printf "%-20s %s%%  ", mount, usage

            if (usage >= threshold)
                print "WARNING - High disk usage"
            else
                print "NORMAL"
        }
    '

    # --------------------------------------
    # Service Health
    # --------------------------------------

    echo ""
    echo "SERVICE HEALTH"
    echo "------------------------------------------"

    for SERVICE in ssh nginx; do
        if systemctl is-active --quiet "$SERVICE"; then
            echo "$SERVICE: ACTIVE"
        else
            echo "$SERVICE: INACTIVE"
        fi
    done

    # --------------------------------------
    # Latest Monitoring Logs
    # --------------------------------------

    echo ""
    echo "LATEST MONITORING LOGS"
    echo "------------------------------------------"

    LOG_PATH="$PROJECT_DIR/$LOG_FILE"

    ROTATED_LOG="${LOG_PATH}-"*

         if [[ -f "$LOG_PATH" ]] && [[ -s "$LOG_PATH" ]]; then
    tail -n 10 "$LOG_PATH"

         elif compgen -G "$ROTATED_LOG" > /dev/null; then
    LATEST_ROTATED_LOG=$(ls -1t ${LOG_PATH}-* | head -n 1)

    echo "Showing entries from: $(basename "$LATEST_ROTATED_LOG")"
    tail -n 10 "$LATEST_ROTATED_LOG"

         else
    echo "No monitoring log entries found."
         fi

    # --------------------------------------
    # Report Footer
    # --------------------------------------

    echo ""
    echo "=========================================="
    echo "          END OF HEALTH REPORT"
    echo "=========================================="

} > "$REPORT_FILE"

echo "SysGuard health report generated successfully!"
echo "Report location: $REPORT_FILE"
