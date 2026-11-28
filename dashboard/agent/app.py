#!/usr/bin/env python3
"""SysGuard live Linux monitoring API and authenticated operations."""
from __future__ import annotations

import os
import re
import ipaddress
import secrets
import shutil
import subprocess
import time
from datetime import datetime, timezone, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, session

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = Path(os.environ.get("SYSGUARD_HOME", APP_DIR.parents[1])).resolve()
WEB_DIR = APP_DIR.parent / "web"
CONFIG = PROJECT_DIR / "config" / "sysguard.conf"
API_TOKEN = os.environ.get("SYSGUARD_API_TOKEN", "")
SESSION_SECRET = os.environ.get("SYSGUARD_SESSION_SECRET", "")
PAIRING_FILE = PROJECT_DIR / "logs" / ".agent-pairing.json"
ALLOWED_ORIGINS = {
    x.strip()
    for x in os.environ.get("SYSGUARD_ALLOWED_ORIGINS", "").split(",")
    if x.strip()
}
BACKUP_DIR = Path(os.environ.get("SYSGUARD_BACKUP_DIR", PROJECT_DIR / "backups"))
REPORT_DIR = Path(os.environ.get("SYSGUARD_REPORT_DIR", PROJECT_DIR / "reports"))
LOG_FILE = Path(os.environ.get("SYSGUARD_LOG_FILE", PROJECT_DIR / "logs" / "sysguard.log"))
app = Flask(__name__, static_folder=None)
app.secret_key = SESSION_SECRET or None
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Strict",
    SESSION_COOKIE_SECURE=False,
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def read_config():
    values = {
        "cpu": 80,
        "memory": 80,
        "disk": 80,
        "backup_retention_days": 7,
        "services": ["ssh", "nginx"],
    }
    if not CONFIG.is_file():
        return values

    raw = CONFIG.read_text(errors="replace")
    keys = {
        "CPU_THRESHOLD": "cpu",
        "MEMORY_THRESHOLD": "memory",
        "DISK_THRESHOLD": "disk",
        "BACKUP_RETENTION_DAYS": "backup_retention_days",
    }
    for source, target in keys.items():
        match = re.search(rf"^\s*{source}\s*=\s*['\"]?(\d+)", raw, re.M)
        if match:
            values[target] = int(match.group(1))

    match = re.search(r"^\s*SERVICES\s*=\s*\((.*?)\)", raw, re.M | re.S)
    if match:
        services = re.findall(r"""['"]([A-Za-z0-9_.@-]+)['"]""", match.group(1))
        if services:
            values["services"] = services

    return values


def authorized(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        supplied = request.headers.get("X-SysGuard-Token", "")
        if API_TOKEN and supplied and secrets.compare_digest(supplied, API_TOKEN):
            return fn(*args, **kwargs)

        if SESSION_SECRET and session.get("sysguard_paired"):
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                allowed_hosts = {"127.0.0.1:8765", "localhost:8765"}
                origin = request.headers.get("Origin", "")
                if request.host not in allowed_hosts or origin != f"http://{request.host}":
                    return jsonify(error="Request origin rejected."), 403
            return fn(*args, **kwargs)

        if not API_TOKEN and not SESSION_SECRET:
            return jsonify(error="Authentication is not configured."), 503
        return jsonify(error="Unauthorized. Pair this browser with the local agent."), 401
    return wrapper


@app.after_request
def security_headers(response):
    origin = request.headers.get("Origin")
    if origin and origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-SysGuard-Token"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options(_path):
    return "", 204


def local_pairing_request():
    try:
        remote = ipaddress.ip_address(request.remote_addr or "")
    except ValueError:
        return False

    allowed_hosts = {"127.0.0.1:8765", "localhost:8765"}
    return remote.is_loopback and request.host in allowed_hosts


@app.get("/api/session/status")
def session_status():
    return jsonify(paired=bool(SESSION_SECRET and session.get("sysguard_paired")))


@app.post("/api/session/pair")
def pair_session():
    if not SESSION_SECRET:
        return jsonify(error="Browser sessions are not configured."), 503

    if not local_pairing_request():
        return jsonify(error="Pairing is only allowed through the local dashboard."), 403

    if request.headers.get("Origin") != f"http://{request.host}":
        return jsonify(error="Invalid request origin."), 403

    payload = request.get_json(silent=True) or {}
    supplied = str(payload.get("code", "")).strip()

    if not supplied or not PAIRING_FILE.is_file():
        return jsonify(error="No active pairing code. Generate one in your WSL terminal."), 401

    try:
        import json
        record = json.loads(PAIRING_FILE.read_text())
        expected = str(record.get("code", ""))
        expires = float(record.get("expires_at", 0))
    except (OSError, ValueError, TypeError):
        return jsonify(error="Pairing code could not be read. Generate a new one."), 401

    if time.time() > expires:
        PAIRING_FILE.unlink(missing_ok=True)
        return jsonify(error="Pairing code expired. Generate a new one."), 401

    if not expected or not secrets.compare_digest(supplied, expected):
        return jsonify(error="Incorrect pairing code."), 401

    PAIRING_FILE.unlink(missing_ok=True)
    session.clear()
    session["sysguard_paired"] = True
    session.permanent = True
    return jsonify(ok=True, paired=True)


@app.post("/api/session/logout")
def session_logout():
    if request.host not in {"127.0.0.1:8765", "localhost:8765"}:
        return jsonify(error="Invalid local host."), 403
    if request.headers.get("Origin") != f"http://{request.host}":
        return jsonify(error="Invalid request origin."), 403
    session.clear()
    return jsonify(ok=True)


def cpu_percent():
    def read():
        fields = Path("/proc/stat").read_text().splitlines()[0].split()[1:]
        numbers = [int(value) for value in fields]
        return sum(numbers), numbers[3] + (numbers[4] if len(numbers) > 4 else 0)

    try:
        total_a, idle_a = read()
        time.sleep(0.35)
        total_b, idle_b = read()
        total_delta = total_b - total_a
        idle_delta = idle_b - idle_a
        if total_delta <= 0:
            return None
        return round(max(0, min(100, (total_delta - idle_delta) / total_delta * 100)), 1)
    except Exception:
        return None


def memory_percent():
    try:
        values = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            key, value = line.split(":", 1)
            values[key] = int(value.strip().split()[0])
        total = values["MemTotal"]
        available = values.get("MemAvailable", values.get("MemFree", 0))
        return round((total - available) / total * 100, 1) if total else None
    except Exception:
        return None


def disk_info():
    try:
        usage = shutil.disk_usage("/")
        return {
            "mount": "/",
            "used_percent": round(usage.used / usage.total * 100, 1),
            "used_bytes": usage.used,
            "total_bytes": usage.total,
            "free_bytes": usage.free,
        }
    except Exception:
        return {"mount": "/", "used_percent": None}


def filesystem_info():
    result = []
    try:
        output = subprocess.check_output(
            ["df", "-PT"], text=True, stderr=subprocess.DEVNULL, timeout=8
        )
        for line in output.splitlines()[1:]:
            fields = line.split()
            if len(fields) < 7:
                continue
            device, fs_type, size, used, available, percent, mount = fields[:7]
            if (
                fs_type in {"tmpfs", "devtmpfs", "squashfs"}
                or device.startswith("/dev/loop")
                or mount.startswith(("/snap/", "/usr/lib/wsl/", "/mnt/wsl"))
                or mount == "/init"
                or mount.startswith("/usr/lib/modules/")
            ):
                continue
            try:
                total = int(size) * 1024
                used_bytes = int(used) * 1024
                free_bytes = int(available) * 1024
                used_percent = float(percent.rstrip("%"))
            except ValueError:
                continue
            result.append({
                "mount": mount,
                "filesystem": device,
                "type": fs_type,
                "used_percent": used_percent,
                "used_bytes": used_bytes,
                "total_bytes": total,
                "free_bytes": free_bytes,
            })
    except Exception:
        pass
    return result


def service_status(name):
    if not re.fullmatch(r"[A-Za-z0-9_.@-]{1,80}", name):
        return {"name": name, "state": "invalid"}
    try:
        result = subprocess.run(
            ["systemctl", "is-active", name],
            capture_output=True, text=True, timeout=5
        )
        state = result.stdout.strip() or "unknown"
        return {"name": name, "state": state, "return_code": result.returncode}
    except Exception as exc:
        return {"name": name, "state": "unknown", "detail": str(exc)}


def list_files(folder, prefixes, limit=50):
    try:
        if not folder.exists():
            return []
        files = [
            path for path in folder.iterdir()
            if path.is_file() and any(path.name.startswith(prefix) for prefix in prefixes)
        ]
        files.sort(key=lambda path: path.stat().st_mtime, reverse=True)
        return [
            {
                "name": path.name,
                "size_bytes": path.stat().st_size,
                "modified": datetime.fromtimestamp(
                    path.stat().st_mtime, timezone.utc
                ).isoformat(),
            }
            for path in files[:limit]
        ]
    except Exception:
        return []


def tail_logs(limit=150):
    try:
        candidates = [LOG_FILE]
        if LOG_FILE.parent.exists():
            candidates.extend(
                sorted(
                    LOG_FILE.parent.glob(LOG_FILE.name + "-*"),
                    key=lambda path: path.stat().st_mtime,
                    reverse=True,
                )
            )
        existing = next((path for path in candidates if path.is_file() and path.stat().st_size), None)
        if not existing:
            return []
        lines = existing.read_text(errors="replace").splitlines()[-limit:]
        return [
            {
                "text": line,
                "level": (
                    "error" if "ERROR" in line.upper()
                    else "warning" if "WARNING" in line.upper()
                    else "info"
                ),
                "source": existing.name,
            }
            for line in lines
        ]
    except Exception:
        return []


def collect_resources():
    return {
        "timestamp": utc_now(),
        "cpu": cpu_percent(),
        "memory": memory_percent(),
        "disk": disk_info(),
        "filesystems": filesystem_info(),
        "uptime_seconds": (
            float(Path("/proc/uptime").read_text().split()[0])
            if Path("/proc/uptime").exists() else None
        ),
    }


def collect_status():
    resources = collect_resources()
    config = read_config()
    services = [service_status(name) for name in config["services"]]
    warnings = []

    for key, label in [
        ("cpu", "CPU"),
        ("memory", "Memory"),
    ]:
        value = resources.get(key)
        if value is not None and value >= config[key]:
            warnings.append(f"{label} threshold exceeded")

    disk_value = resources["disk"].get("used_percent")
    if disk_value is not None and disk_value >= config["disk"]:
        warnings.append("Disk threshold exceeded")

    if any(service["state"] != "active" for service in services):
        warnings.append("One or more monitored services are not active")

    try:
        hostname = subprocess.check_output(
            ["hostname"], text=True, timeout=2
        ).strip()
    except Exception:
        hostname = "Linux host"

    try:
        os_info = {}
        for line in Path("/etc/os-release").read_text().splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                os_info[key] = value.strip('"')
        operating_system = os_info.get("PRETTY_NAME", "Linux")
    except Exception:
        operating_system = "Linux"

    metrics = {
        "cpu": resources["cpu"],
        "memory": resources["memory"],
        "disk": resources["disk"],
        "filesystems": resources["filesystems"],
        "uptime_seconds": resources["uptime_seconds"],
    }

    return {
        "timestamp": resources["timestamp"],
        "hostname": hostname,
        "operating_system": operating_system,
        "metrics": metrics,
        "thresholds": config,
        "services": services,
        "backups": list_files(BACKUP_DIR, ["sysguard_backup_"]),
        "reports": list_files(REPORT_DIR, ["health_report_"]),
        "logs": tail_logs(),
        "warnings": warnings,
        "project_version": "1.0",
    }


def run_script(script_name, timeout=120):
    script = PROJECT_DIR / "scripts" / script_name
    if not script.is_file():
        return None, (jsonify(error=f"Script not found: {script_name}"), 404)
    try:
        result = subprocess.run(
            ["/bin/bash", str(script)],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = (result.stdout + result.stderr).strip()[-16000:]
        return {
            "ok": result.returncode == 0,
            "return_code": result.returncode,
            "output": output or "(The script returned no terminal output.)",
            "timestamp": utc_now(),
        }, None
    except subprocess.TimeoutExpired:
        return None, (jsonify(error=f"{script_name} timed out."), 504)
    except Exception as exc:
        return None, (jsonify(error=str(exc)), 500)


@app.get("/")
def root():
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/status.json")
def public_snapshot():
    return send_from_directory(WEB_DIR, "status.json")


@app.get("/assets/<path:path>")
def assets(path):
    return send_from_directory(WEB_DIR / "assets", path)


@app.get("/api/health")
def health():
    return jsonify(
        api="SysGuard API",
        status="ok",
        authentication_configured=bool(API_TOKEN),
        timestamp=utc_now(),
    )


@app.get("/api/status")
@authorized
def status():
    return jsonify(collect_status())


@app.get("/api/resources")
@authorized
def resources():
    return jsonify(collect_resources())


@app.get("/api/services")
@authorized
def services():
    config = read_config()
    return jsonify(timestamp=utc_now(), services=[
        service_status(name) for name in config["services"]
    ])


@app.get("/api/backups")
@authorized
def backups():
    return jsonify(
        timestamp=utc_now(),
        retention_days=read_config()["backup_retention_days"],
        directory=str(BACKUP_DIR),
        files=list_files(BACKUP_DIR, ["sysguard_backup_"]),
    )


@app.get("/api/logs")
@authorized
def logs():
    return jsonify(timestamp=utc_now(), entries=tail_logs(250), source=str(LOG_FILE))


@app.get("/api/reports")
@authorized
def reports():
    return jsonify(timestamp=utc_now(), files=list_files(REPORT_DIR, ["health_report_"]))


@app.get("/api/reports/<path:name>")
@authorized
def report_detail(name):
    if Path(name).name != name or not name.startswith("health_report_"):
        return jsonify(error="Invalid report name"), 400
    path = REPORT_DIR / name
    if not path.is_file():
        return jsonify(error="Report not found"), 404
    return jsonify(name=name, content=path.read_text(errors="replace"))


@app.get("/api/config")
@authorized
def get_config():
    return jsonify(timestamp=utc_now(), config=read_config())


@app.post("/api/config")
@authorized
def update_config():
    payload = request.get_json(silent=True) or {}
    allowed = {
        "cpu": "CPU_THRESHOLD",
        "memory": "MEMORY_THRESHOLD",
        "disk": "DISK_THRESHOLD",
        "backup_retention_days": "BACKUP_RETENTION_DAYS",
    }
    changes = {}
    for key in allowed:
        if key not in payload:
            continue
        try:
            value = int(payload[key])
        except (TypeError, ValueError):
            return jsonify(error=f"{key} must be an integer"), 400
        minimum, maximum = (1, 365) if key == "backup_retention_days" else (10, 100)
        if not minimum <= value <= maximum:
            return jsonify(error=f"{key} must be between {minimum} and {maximum}"), 400
        changes[key] = value

    if not changes:
        return jsonify(error="No valid configuration changes supplied"), 400
    if not CONFIG.is_file():
        return jsonify(error="Configuration file not found"), 404

    raw = CONFIG.read_text()
    for key, value in changes.items():
        source_key = allowed[key]
        pattern = rf"(?m)^(\s*{source_key}\s*=\s*)['\"]?\d+['\"]?\s*$"
        raw, count = re.subn(pattern, rf"\g<1>{value}", raw, count=1)
        if count != 1:
            return jsonify(error=f"Could not safely update {source_key}"), 500

    temporary = CONFIG.with_suffix(".conf.tmp")
    try:
        temporary.write_text(raw)
        os.chmod(temporary, CONFIG.stat().st_mode & 0o777)
        os.replace(temporary, CONFIG)
    finally:
        if temporary.exists():
            temporary.unlink()

    return jsonify(ok=True, updated=changes, config=read_config(), timestamp=utc_now())


@app.post("/api/actions/health-check")
@authorized
def run_health_check():
    result, error = run_script("sysguard.sh", 120)
    if error:
        return error
    return jsonify(result), (200 if result["ok"] else 500)


@app.post("/api/actions/backup")
@authorized
def run_backup():
    result, error = run_script("backup.sh", 240)
    if error:
        return error
    result["files"] = list_files(BACKUP_DIR, ["sysguard_backup_"])
    return jsonify(result), (200 if result["ok"] else 500)


@app.post("/api/actions/report")
@authorized
def generate_report():
    result, error = run_script("health-report.sh", 120)
    if error:
        return error
    files = list_files(REPORT_DIR, ["health_report_"])
    content = ""
    if files:
        content = (REPORT_DIR / files[0]["name"]).read_text(errors="replace")
    result["reports"] = files
    result["report"] = content
    return jsonify(result), (200 if result["ok"] else 500)


@app.post("/api/actions/restart-service")
@authorized
def restart_service():
    payload = request.get_json(silent=True) or {}
    name = payload.get("service", "")
    if name not in read_config()["services"]:
        return jsonify(error="Service is not in the configured allowlist"), 400
    if not re.fullmatch(r"[A-Za-z0-9_.@-]{1,80}", name):
        return jsonify(error="Invalid service name"), 400
    try:
        result = subprocess.run(
            ["sudo", "-n", "systemctl", "restart", name],
            capture_output=True, text=True, timeout=25,
        )
        current = service_status(name)
        ok = result.returncode == 0 and current["state"] == "active"
        return jsonify(
            ok=ok,
            service=current,
            output=(result.stdout + result.stderr).strip(),
            timestamp=utc_now(),
        ), (200 if ok else 500)
    except subprocess.TimeoutExpired:
        return jsonify(error="Service restart timed out"), 504


if __name__ == "__main__":
    app.run(
        host=os.environ.get("SYSGUARD_BIND_HOST", "127.0.0.1"),
        port=int(os.environ.get("SYSGUARD_PORT", "8765")),
        debug=False,
    )
