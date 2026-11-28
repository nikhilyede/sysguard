#!/usr/bin/env python3
"""Publish a sanitized, read-only snapshot for the public dashboard."""

import json
import os
import tempfile
from datetime import datetime, timezone

from app import collect_status, WEB_DIR


def sanitize_public_snapshot(data):
    """Remove host-specific filesystem and exact storage information."""
    metrics = data.get("metrics", {})

    disk = metrics.get("disk")
    filesystems = metrics.get("filesystems", [])

    root = next(
        (item for item in filesystems if item.get("mount") == "/"),
        {},
    )

    used_percent = root.get(
        "used_percent",
        disk.get("used_percent") if isinstance(disk, dict) else None,
    )

    metrics["disk"] = {
        "mount": "/",
        "used_percent": used_percent,
    }

    metrics["filesystems"] = (
        [{
            "filesystem": "Linux filesystem",
            "mount": "/",
            "type": "Linux",
            "used_percent": used_percent,
        }]
        if used_percent is not None else []
    )

    data["metrics"] = metrics
    data["hostname"] = "SysGuard Linux host"
    data["logs"] = []
    data["public_snapshot"] = True
    data["snapshot_generated_at"] = datetime.now(timezone.utc).isoformat()
    data["snapshot_note"] = (
        "Read-only snapshot. Live Linux operations require the authenticated local agent."
    )

    return data


def main():
    data = sanitize_public_snapshot(collect_status())

    WEB_DIR.mkdir(parents=True, exist_ok=True)
    destination = WEB_DIR / "status.json"

    fd, temporary = tempfile.mkstemp(
        prefix=".status-",
        suffix=".json",
        dir=WEB_DIR,
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
            handle.write("\n")

        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

    print(f"Public snapshot updated: {destination}")
    print(f"Generated: {data['snapshot_generated_at']}")
    print(f"CPU: {data['metrics']['cpu']}%")
    print(f"Memory: {data['metrics']['memory']}%")
    print(f"Public filesystems: {len(data['metrics']['filesystems'])}")
    print(f"Services: {len(data['services'])}")


if __name__ == "__main__":
    main()
