# SysGuard Hybrid Dashboard

A portfolio-ready web dashboard for the existing SysGuard Bash project. It has an interactive browser demo and an optional authenticated Linux API for live host metrics, systemd service status, log tails, backup inventory, health-check execution, backup execution, and allowlisted service restarts.

## Project layout

```text
dashboard/
├── agent/app.py                 # Flask API and optional same-origin web server
├── web/index.html               # Dashboard interface
├── web/style.css                # Responsive dark operations UI
├── web/app.js                   # Demo simulation and live API client
├── deploy/sysguard-dashboard.service.example
├── requirements.txt
└── README.md
```

## 1. Install beside your existing SysGuard project

Extract/copy this `dashboard/` directory into `~/sysguard/dashboard`. Keep your existing `config/` and `scripts/` unchanged.

```bash
cd ~/sysguard/dashboard
python3 -m venv ~/.venvs/sysguard-dashboard
. ~/.venvs/sysguard-dashboard/bin/activate
pip install -r requirements.txt
generate_token=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
printf 'Save this token securely: %s\n' "$generate_token"
```

Set the token in the same shell before starting the local API:

```bash
export SYSGUARD_API_TOKEN='PASTE_A_LONG_RANDOM_TOKEN_HERE'
export SYSGUARD_HOME="$HOME/sysguard"
python agent/app.py
```

Open `http://127.0.0.1:8765`. The API binds to loopback by default. `/api/health` is a non-sensitive liveness check; all other API endpoints require `X-SysGuard-Token`. The virtual environment is stored outside `~/sysguard` so the existing project-backup script does not archive installed Python packages.

## 2. Demo mode

The dashboard opens in Demo mode automatically. It uses generated sample values and simulated events in the browser. The failure simulation, restart demonstration, health-check demonstration, backup demonstration, and report preview do not execute commands on the host.

Demo values are illustrative, not real monitoring data. The UI labels demo mode clearly.

## 3. Live mode

Open Settings and provide:

- API base URL (for local testing: `http://127.0.0.1:8765`)
- the token configured in `SYSGUARD_API_TOKEN`

The token is kept in JavaScript memory for the current page session and is not saved to local storage. For cross-origin access, configure `SYSGUARD_ALLOWED_ORIGINS` with the exact trusted portfolio origin(s), comma-separated. Do not use `*`.

For a public portfolio, do **not** expose the WSL host or Flask development server directly. Use a hardened Linux host or VPN/private access, HTTPS reverse proxy, firewall allowlist, rate limiting, and a secret token. GitHub Pages cannot securely store a private API token. Visitors should use Demo mode; live mode should be enabled only for an authenticated operator or a controlled private deployment.

## 4. API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Liveness and whether token is configured |
| `/api/status` | GET | Metrics, thresholds, services, backup/report inventory, log tail |
| `/api/actions/health-check` | POST | Runs existing `scripts/sysguard.sh` |
| `/api/actions/backup` | POST | Runs existing `scripts/backup.sh` |
| `/api/actions/report` | POST | Runs existing `scripts/health-report.sh` and returns the latest report text |
| `/api/actions/restart-service` | POST | Restarts a configured allowlisted service |

All endpoints except `/api/health` require `X-SysGuard-Token`. The API uses argument arrays rather than shell interpolation. Service names are restricted to the configured allowlist.

## 5. Optional service restart permission

The API's restart action calls `sudo -n systemctl restart <allowlisted-service>`. It will fail safely unless the service account has an explicit, narrow sudoers permission. Do not grant unrestricted sudo to the web process. Example (review and adjust the account and service names first):

```sudoers
nikhil ALL=(root) NOPASSWD: /usr/bin/systemctl restart ssh, /usr/bin/systemctl restart nginx
```

Validate with `sudo visudo -cf /etc/sudoers.d/sysguard-dashboard`. If your `systemctl` binary is elsewhere, use `command -v systemctl` and put the exact path in sudoers. The dashboard's live API only accepts service names in `SYSGUARD_SERVICES` (default `ssh,nginx`).

## 6. WSL notes

WSL must be running for the local agent and cron jobs to operate. A dashboard running on GitHub Pages cannot directly reach a Windows-hosted WSL service in a secure, reliable way without an explicitly configured network path. Start with local loopback testing; use a separately secured Linux host for remote live monitoring.

## 7. Existing SysGuard behavior and scope

This dashboard calls the existing monitoring and backup scripts rather than reimplementing their logic. Your current `sysguard.sh` checks CPU, memory, disk, SSH and Nginx, and attempts service recovery using sudo. Your current `backup.sh` archives the SysGuard project directory and prunes archives older than its configured retention period. The README notes that the current backup script does **not** back up `/var/log` or `/var/www/html`. The dashboard therefore labels the backup scope as the SysGuard project only.

The health-report script writes reports under `reports/`. This first dashboard release inventories report files and displays output from an on-demand monitoring run; it does not yet download arbitrary host files over the API.

## 8. Security and operational cautions

- Keep the API bound to `127.0.0.1` unless you have deliberately configured a secure remote deployment.
- Use HTTPS for any remote access; never expose the Flask development server directly. The browser demo can be hosted on GitHub Pages independently of the live agent.
- Keep `SYSGUARD_API_TOKEN` outside source control and rotate it if disclosed.
- Restrict CORS to exact trusted origins; CORS is not authentication.
- Keep the service account unprivileged and grant only narrowly scoped sudoers commands if live restart is needed.
- Health-check and backup actions execute the existing scripts and may consume CPU, disk, or invoke configured recovery behavior.
- Do not use the public demo UI as a control panel for a production server.
- The agent currently reports the root filesystem `/`; extend the collector if you want every mounted filesystem displayed.

## 9. Portfolio hosting

The static `web/` folder can be hosted on GitHub Pages. For a Pages-only deployment, use Demo mode. The optional live API requires a separate secured host and cannot safely be made public by placing its token in the portfolio's JavaScript. For Pages, configure the frontend API URL only when the API is deliberately available over HTTPS and protected by a separate authentication layer; do not publish an operator token.
