"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const tabs = ["overview","monitor","backup","report","config","tests"];
  const endpoints = {
    overview:"/api/status",
    monitor:"/api/resources",
    services:"/api/services",
    backup:"/api/backups",
    logs:"/api/logs",
    report:"/api/reports",
    config:"/api/config"
  };

  const state = {
    tab:"overview",
    apiUrl:"",
    token:"",
    connected:false,
    snapshot:null,
    current:{},
    thresholds:{cpu:80,memory:80,disk:80},
    retention:7
  };

  function toast(message,error=false) {
    const el=$("toast");
    el.textContent=message;
    el.classList.toggle("error",error);
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>el.classList.remove("show"),3600);
  }

  function setStatus(message) {
    $("page-status").textContent=message;
  }

  function stamp(value) {
    if(!value) return "Not available";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
  }

  function num(value) {
    if(typeof value==="number") return value;
    if(value && typeof value==="object") {
      return Number(value.percent ?? value.percentage ?? value.value ?? 0);
    }
    const parsed=parseFloat(value);
    return Number.isFinite(parsed)?parsed:0;
  }

  function percent(value) {
    return `${num(value).toFixed(1)}%`;
  }

  function safeText(value) {
    if(value===null || value===undefined || value==="") return "—";
    if(typeof value==="object") return JSON.stringify(value,null,2);
    return String(value);
  }

  function setText(id,value) {
    const el=$(id);
    if(el) el.textContent=safeText(value);
  }

  function setMeter(id,value) {
    const el=$(id);
    if(!el) return;
    const v=Math.max(0,Math.min(100,num(value)));
    el.style.width=`${v}%`;
    el.className=v>=90?"critical":v>=80?"warning":"";
  }

  function setSource(id,text) {
    const el=$(id);
    if(el) el.textContent=text;
  }

  function setConnection(connected,label) {
    state.connected=connected;
    const el=$("connection");
    el.classList.toggle("connected",connected);
    el.innerHTML="";
    const dot=document.createElement("i");
    const text=document.createElement("span");
    text.textContent=label;
    el.append(dot,text);
  }

  const localMode=["127.0.0.1","localhost"].includes(location.hostname)
    && location.port==="8765" && location.protocol==="http:";

  async function request(path,options={}) {
    if(!state.apiUrl && !localMode) throw new Error("Connect to the local API first.");
    const headers={...(options.headers||{})};
    if(state.token) headers["X-SysGuard-Token"]=state.token;
    if(options.body) headers["Content-Type"]="application/json";
    const base=state.apiUrl.replace(/\/+$/,"");
    const response=await fetch(base+path,{
      ...options,headers,cache:"no-store",credentials:"same-origin"
    });
    const raw=await response.text();
    let data;
    try { data=raw?JSON.parse(raw):{}; }
    catch { data={message:raw}; }
    if(!response.ok) {
      throw new Error(data.error||data.message||`HTTP ${response.status}`);
    }
    return data;
  }

  async function publicSnapshot() {
    const response=await fetch(`./status.json?t=${Date.now()}`,{cache:"no-store"});
    if(!response.ok) throw new Error("Public status snapshot is not available.");
    return response.json();
  }

  function arrayOf(value) {
    if(Array.isArray(value)) return value;
    if(value && typeof value==="object") {
      return Object.entries(value).map(([name,item])=>
        typeof item==="object"?{name,...item}:{name,status:item});
    }
    return [];
  }

  function serviceName(item) {
    return item.name||item.service||item.unit||"Unknown service";
  }

  function serviceState(item) {
    return String(item.status||item.state||item.active_state||"unknown").toLowerCase();
  }

  function isActive(value) {
    return ["active","running","ok","healthy"].includes(value);
  }

  function renderServices(items,targetId) {
    const target=$(targetId);
    target.replaceChildren();
    const list=arrayOf(items);
    if(!list.length) {
      target.innerHTML='<div class="empty">No service records were returned.</div>';
      return;
    }
    list.forEach(item=>{
      const status=serviceState(item);
      const row=document.createElement("div");
      row.className="result-row";
      const info=document.createElement("div");
      const name=document.createElement("div");
      name.className="result-name";
      name.textContent=serviceName(item);
      const detail=document.createElement("small");
      detail.textContent=item.description||item.load_state||"systemd service";
      info.append(name,detail);
      const actions=document.createElement("div");
      actions.style.display="flex";
      actions.style.alignItems="center";
      actions.style.gap="8px";
      const pill=document.createElement("span");
      pill.className=`status-pill ${isActive(status)?"good":"bad"}`;
      pill.textContent=status.toUpperCase();
      actions.append(pill);
      if(state.connected) {
        const restart=document.createElement("button");
        restart.className="text-button";
        restart.textContent="Restart";
        restart.addEventListener("click",()=>restartService(serviceName(item)));
        actions.append(restart);
      }
      row.append(info,actions);
      target.append(row);
    });
  }

  function renderFilesystems(items,targetId) {
    const target=$(targetId);
    target.replaceChildren();
    const list=arrayOf(items);
    if(!list.length) {
      target.innerHTML='<div class="empty">No filesystem records were returned.</div>';
      return;
    }
    const table=document.createElement("table");
    table.innerHTML="<thead><tr><th>FILESYSTEM</th><th>MOUNT</th><th>TYPE</th><th>USED</th></tr></thead>";
    const body=document.createElement("tbody");
    list.forEach(item=>{
      const tr=document.createElement("tr");
      [item.filesystem||item.device||item.source||"—",
       item.mountpoint||item.mount||"—",
       item.type||item.fstype||"—",
       percent(item.used_percent??item.percent??item.used)].forEach(value=>{
        const td=document.createElement("td");td.textContent=safeText(value);tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
    target.append(table);
  }

  function renderOverview(data) {
    state.current.overview=data;
    const m=data.metrics||data;
    const cpu=m.cpu??m.cpu_percent;
    const memory=m.memory??m.ram;
    const disk=m.disk??m.root_disk;
    const diskPct=disk && typeof disk==="object"?(disk.percent??disk.used_percent??disk.usage_percent):disk;
    setText("cpu-value",percent(cpu));
    setText("memory-value",percent(memory));
    setText("disk-value",percent(diskPct));
    setMeter("cpu-bar",cpu);setMeter("memory-bar",memory);setMeter("disk-bar",diskPct);
    setText("cpu-detail",`Threshold ${state.thresholds.cpu}%`);
    setText("memory-detail",`Threshold ${state.thresholds.memory}%`);
    setText("disk-detail",`Threshold ${state.thresholds.disk}%`);
    const services=arrayOf(data.services);
    const active=services.filter(x=>isActive(serviceState(x))).length;
    setText("service-value",services.length?`${active}/${services.length}`:"—");
    setText("service-detail",services.length?"Active / monitored":"No service data");
    setText("host-name",data.hostname);
    setText("host-os",data.operating_system||data.os);
    setText("project-version",data.project_version);
    setText("host-uptime",m.uptime_seconds?`${Math.floor(m.uptime_seconds/3600)} hours`:"—");
    setText("host-timestamp",stamp(data.timestamp));
    renderServices(data.services||[],"overview-services");
    renderFilesystems(m.filesystems||[],"overview-filesystems");
    setSource("overview-source",state.connected?"LIVE AGENT":"PUBLISHED SNAPSHOT");
  }

  function renderResources(data) {
    state.current.resources=data;
    const cpu=data.cpu,mem=data.memory,disk=data.disk;
    [["cpu",cpu],["memory",mem],["disk",disk]].forEach(([key,value])=>{
      const val=key==="disk"&&value&&typeof value==="object"?(value.percent??value.used_percent??value.usage_percent):value;
      setText(`monitor-${key}`,percent(val));
      setMeter(`monitor-${key}-bar`,val);
      setText(`monitor-${key}-note`,key==="disk"&&value&&typeof value==="object"?
        `${value.free??value.available??"—"} available · ${value.total??"—"} total`:
        `Collected ${stamp(data.timestamp)}`);
    });
    renderFilesystems(data.filesystems||[],"overview-filesystems");
    setSource("monitor-source",state.connected?"LIVE MEASUREMENT":"PUBLISHED SNAPSHOT");
  }

  function renderBackups(data) {
    state.current.backups=data;
    const files=arrayOf(data.files||data.backups);
    setText("backup-count",files.length);
    setText("backup-retention",data.retention_days!==undefined?`${data.retention_days} days`:"—");
    setText("backup-directory",data.directory||"—");
    const target=$("backup-list");target.replaceChildren();
    if(!files.length) {
      target.innerHTML='<div class="empty">No backup archives were found in the configured directory.</div>';
    } else {
      const table=document.createElement("table");
      table.innerHTML="<thead><tr><th>ARCHIVE</th><th>SIZE</th><th>MODIFIED</th></tr></thead>";
      const body=document.createElement("tbody");
      files.forEach(file=>{
        const tr=document.createElement("tr");
        [file.name||file.filename||"—",file.size_human||file.size||"—",stamp(file.modified||file.mtime)].forEach(v=>{
          const td=document.createElement("td");td.textContent=safeText(v);tr.append(td);
        });
        body.append(tr);
      });
      table.append(body);target.append(table);
    }
    setSource("backup-source",state.connected?"LIVE FILE INVENTORY":"PUBLISHED SNAPSHOT");
  }

  function renderReports(data) {
    state.current.reports=data;
    const files=arrayOf(data.files||data.reports);
    const target=$("report-list");target.replaceChildren();
    if(!files.length) {
      target.innerHTML='<div class="empty">No health reports were found.</div>';
    } else {
      files.forEach(file=>{
        const name=file.name||file.filename||"";
        const row=document.createElement("div");row.className="result-row";
        const info=document.createElement("div");
        const title=document.createElement("div");title.className="result-name";title.textContent=name;
        const detail=document.createElement("small");detail.textContent=stamp(file.modified||file.mtime);
        info.append(title,detail);
        const view=document.createElement("button");view.className="text-button";view.textContent="View report";
        view.addEventListener("click",()=>loadReport(name));
        row.append(info,view);target.append(row);
      });
    }
    setSource("report-source",state.connected?"LIVE REPORT INVENTORY":"PUBLISHED SNAPSHOT");
  }

  function renderConfig(data) {
    state.current.config=data;
    const cfg=data.config||data.thresholds||data;
    const get=(...keys)=>{
      for(const key of keys) if(cfg[key]!==undefined) return cfg[key];
      return "";
    };
    const values={
      cpu:get("CPU_THRESHOLD","cpu","cpu_threshold"),
      memory:get("MEMORY_THRESHOLD","memory","memory_threshold"),
      disk:get("DISK_THRESHOLD","disk","disk_threshold"),
      retention:get("BACKUP_RETENTION_DAYS","retention_days","retention")
    };
    if(values.cpu!=="") $("cfg-cpu").value=values.cpu;
    if(values.memory!=="") $("cfg-memory").value=values.memory;
    if(values.disk!=="") $("cfg-disk").value=values.disk;
    if(values.retention!=="") $("cfg-retention").value=values.retention;
    state.thresholds={cpu:num(values.cpu)||80,memory:num(values.memory)||80,disk:num(values.disk)||80};
    state.retention=num(values.retention)||7;
    $("config-output").textContent=JSON.stringify(cfg,null,2);
    setSource("config-source","LIVE CONFIGURATION");
  }

  function showOutput(id,value) {
    const el=$(id);
    if(typeof value==="string") el.textContent=value;
    else el.textContent=JSON.stringify(value,null,2);
  }

  function actionOutput(data) {
    const parts=[];
    if(data.stdout) parts.push(data.stdout);
    if(data.stderr) parts.push(data.stderr);
    if(data.output) parts.push(data.output);
    if(data.message && !parts.length) parts.push(data.message);
    if(data.report) parts.push(typeof data.report==="string"?data.report:JSON.stringify(data.report,null,2));
    if(data.returncode!==undefined) parts.push(`\nExit code: ${data.returncode}`);
    if(data.exit_code!==undefined) parts.push(`\nExit code: ${data.exit_code}`);
    return parts.join("\n")||JSON.stringify(data,null,2);
  }

  async function loadTab(tab) {
    state.tab=tab;
    setStatus(`Loading ${tab}…`);
    $("last-updated").textContent="Collecting data…";
    if(!state.connected) {
      try {
        const data=await publicSnapshot();
        state.snapshot=data;
        if(tab==="overview") renderOverview(data);
        else if(tab==="monitor") {
          const m=data.metrics||{};
          renderResources({...m,timestamp:data.timestamp});
          renderServices(data.services||[],"service-list");
        } else if(tab==="backup") renderBackups({files:data.backups||[],timestamp:data.timestamp});
        else if(tab==="report") renderReports({files:data.reports||[],timestamp:data.timestamp});
        else if(tab==="config") {
          $("config-output").textContent="Public view is read-only. Connect to the authenticated local agent to inspect or update the actual configuration.";
          setSource("config-source","PUBLIC READ-ONLY");
        } else if(tab==="tests") {
          $("test-results").innerHTML='<div class="empty">Connect to the local agent to run authenticated endpoint checks. Public hosting cannot execute Linux commands.</div>';
          setSource("tests-source","LOCAL AGENT REQUIRED");
        }
        setStatus("Showing published snapshot · read-only");
        $("last-updated").textContent=`Snapshot: ${stamp(data.timestamp)}`;
      } catch(error) {
        setStatus("Unable to load public snapshot");
        toast(error.message,true);
      }
      return;
    }

    try {
      if(tab==="overview") renderOverview(await request("/api/status"));
      if(tab==="monitor") {
        const [resources,services]=await Promise.all([
          request("/api/resources"),request("/api/services")
        ]);
        renderResources(resources);
        renderServices(services.services||[],"service-list");
        state.current.services=services;
      }
      if(tab==="backup") renderBackups(await request("/api/backups"));
      if(tab==="report") renderReports(await request("/api/reports"));
      if(tab==="config") renderConfig(await request("/api/config"));
      if(tab==="tests") await runEndpointTests();
      setStatus(`${tab} · live data loaded`);
      $("last-updated").textContent=`Updated: ${new Date().toLocaleTimeString()}`;
    } catch(error) {
      setStatus(`${tab} · request failed`);
      toast(error.message,true);
      $("last-updated").textContent="Request failed";
    }
  }

  function navigate(tab) {
    if(!tabs.includes(tab)) tab="overview";
    tabs.forEach(name=>{
      const active=name===tab;
      const panel=$(`panel-${name}`);
      panel.hidden=!active;
      const button=document.querySelector(`[data-tab="${name}"]`);
      button.setAttribute("aria-selected",String(active));
    });
    state.tab=tab;
    if(location.hash!==`#${tab}`) history.replaceState(null,"",`#${tab}`);
    loadTab(tab);
  }

  async function pairLocalAgent() {
    const code=$("pair-code").value.trim();
    if(!code) return toast("Enter the pairing code from your WSL terminal.",true);

    try {
      await request("/api/session/pair",{
        method:"POST",
        body:JSON.stringify({code})
      });
      state.apiUrl="";
      state.token="";
      await request("/api/status");
      setConnection(true,"Local WSL agent connected");
      $("pair-code").value="";
      toast("Browser paired successfully. Future visits will reconnect automatically.");
      navigate(state.tab);
    } catch(error) {
      toast("Pairing failed: "+error.message,true);
    }
  }

  async function bootstrapLocalAgent() {
    state.apiUrl="";
    state.token="";
    try {
      const result=await request("/api/session/status");
      if(result.paired) {
        await request("/api/status");
        setConnection(true,"Local WSL agent connected");
        setStatus("Authenticated local agent · live data");
      } else {
        setConnection(false,"Local agent · pairing required");
      }
    } catch(error) {
      setConnection(false,"Local agent unavailable");
    }
    navigate(state.tab);
  }

  async function connect() {
    const url=$("api-url").value.trim().replace(/\/+$/,"");
    const token=$("api-token").value.trim();
    if(!/^https?:\/\//i.test(url)) return toast("Enter a valid API URL.",true);
    if(location.protocol==="https:"&&url.startsWith("http://")) {
      return toast("An HTTPS page cannot connect to an HTTP API. Use HTTPS or open the local dashboard over HTTP.",true);
    }
    state.apiUrl=url;state.token=token;
    try {
      await request("/api/status");
      setConnection(true,"Local agent connected");
      toast("Authenticated connection successful.");
      navigate(state.tab);
    } catch(error) {
      state.apiUrl="";state.token="";state.connected=false;
      setConnection(false,"Public snapshot");
      toast(`Connection failed: ${error.message}`,true);
    }
  }

  function disconnect() {
    state.apiUrl="";state.token="";state.connected=false;
    $("api-token").value="";
    setConnection(false,"Public snapshot");
    toast("Disconnected. Showing public snapshot.");
    navigate(state.tab);
  }

  async function runAction(path,outputId,label,confirmText) {
    if(!state.connected) return toast("Connect to the authenticated local agent first.",true);
    if(confirmText&&!confirm(confirmText)) return;
    setStatus(`${label} running…`);
    showOutput(outputId,"Executing real operation. Please wait…");
    try {
      const data=await request(path,{method:"POST",body:JSON.stringify({})});
      showOutput(outputId,actionOutput(data));
      setStatus(`${label} completed`);
      toast(`${label} operation finished.`);
      return data;
    } catch(error) {
      showOutput(outputId,`OPERATION FAILED\n${error.message}`);
      setStatus(`${label} failed`);
      toast(error.message,true);
      throw error;
    }
  }

  async function restartService(name) {
    if(!state.connected) return;
    if(!confirm(`Restart the real systemd service "${name}" on this Linux host?`)) return;
    try {
      const data=await request("/api/actions/restart-service",{
        method:"POST",body:JSON.stringify({service:name})
      });
      toast(data.message||`${name} restart request completed.`);
      await loadTab("monitor");
    } catch(error) { toast(error.message,true); }
  }

  async function loadLogs() {
    if(!state.connected) {
      $("monitor-logs").textContent="Private host logs are not published to the public website. Connect to the authenticated local agent to read them.";
      return;
    }
    try {
      const data=await request("/api/logs");
      const entries=data.entries||[];
      $("monitor-logs").textContent=Array.isArray(entries)?
        entries.map(x=>typeof x==="string"?x:JSON.stringify(x)).join("\n"):
        JSON.stringify(entries,null,2);
      toast(`Loaded ${Array.isArray(entries)?entries.length:0} log entries.`);
    } catch(error) { $("monitor-logs").textContent=error.message;toast(error.message,true); }
  }

  async function loadReport(name) {
    if(!state.connected) return;
    try {
      const safe=encodeURIComponent(name);
      const data=await request(`/api/reports/${safe}`);
      showOutput("report-output",data.content||data.report||data.text||data);
    } catch(error) {
      $("report-output").textContent=`Unable to load report.\n${error.message}`;
      toast(error.message,true);
    }
  }

  async function runEndpointTests() {
    const checks=[
      ["Overview","/api/status"],["Resources","/api/resources"],
      ["Services","/api/services"],["Backups","/api/backups"],
      ["Logs","/api/logs"],["Reports","/api/reports"],
      ["Settings","/api/config"]
    ];
    const target=$("test-results");target.replaceChildren();
    let passed=0;
    for(const [name,path] of checks) {
      const row=document.createElement("div");row.className="test-row";
      const label=document.createElement("span");label.textContent=name;
      const result=document.createElement("b");result.textContent="CHECKING";
      row.append(label,result);target.append(row);
      try {
        await request(path);
        result.textContent="HTTP 200 · PASS";result.className="pass";passed++;
      } catch(error) {
        result.textContent=`FAIL · ${error.message}`;result.className="fail";
      }
    }
    setSource("tests-source",`${passed}/${checks.length} ENDPOINTS PASSED`);
    setStatus(`Endpoint tests complete · ${passed}/${checks.length} passed`);
  }

  async function saveConfig() {
    if(!state.connected) return toast("Connect to the local agent before saving settings.",true);
    const values={
      cpu:Number($("cfg-cpu").value),
      memory:Number($("cfg-memory").value),
      disk:Number($("cfg-disk").value),
      backup_retention_days:Number($("cfg-retention").value)
    };
    if(Object.values(values).some(v=>!Number.isFinite(v)||v<1)||values.cpu<10||values.cpu>100||values.memory<10||values.memory>100||values.disk<10||values.disk>100||values.backup_retention_days<1||values.backup_retention_days>365) {
      return toast("Enter valid thresholds from 1–100 and retention from 1–365 days.",true);
    }
    if(!confirm("Save these values to the actual config/sysguard.conf file?")) return;
    try {
      const data=await request("/api/config",{method:"POST",body:JSON.stringify(values)});
      $("config-output").textContent=JSON.stringify(data,null,2);
      toast("Configuration update request succeeded.");
      await loadTab("config");
    } catch(error) { toast(`Configuration was not saved: ${error.message}`,true); }
  }

  const commands=[
    ["Run monitoring","./scripts/sysguard.sh"],
    ["Create backup","./scripts/backup.sh"],
    ["Generate report","./scripts/health-report.sh"],
    ["View monitoring log","tail -f logs/sysguard.log"],
    ["List backup archives","ls -lh backups/"],
    ["List health reports","ls -lh reports/"],
    ["Check cron schedule","crontab -l"],
    ["Check Nginx status","systemctl status nginx"]
  ];

  function renderCommands() {
    const target=$("command-list");target.replaceChildren();
    commands.forEach(([label,command])=>{
      const row=document.createElement("div");row.className="command-item";
      const code=document.createElement("code");code.textContent=command;
      const button=document.createElement("button");button.textContent="Copy";
      button.addEventListener("click",async()=>{
        try { await navigator.clipboard.writeText(command);button.textContent="Copied"; }
        catch { toast("Clipboard access is unavailable.",true); }
        setTimeout(()=>button.textContent="Copy",1300);
      });
      row.append(code,button);target.append(row);
    });
  }

  // Tabs and navigation
  document.querySelectorAll("[data-tab]").forEach(button=>
    button.addEventListener("click",()=>navigate(button.dataset.tab))
  );
  document.querySelectorAll("[data-go]").forEach(button=>
    button.addEventListener("click",()=>navigate(button.dataset.go))
  );
  window.addEventListener("hashchange",()=>navigate(location.hash.slice(1)));
  $("refresh").addEventListener("click",()=>loadTab(state.tab));
  $("theme").addEventListener("click",()=>{
    const next=document.documentElement.dataset.theme==="light"?"dark":"light";
    document.documentElement.dataset.theme=next;
    $("theme").textContent=next==="dark"?"☼ Theme":"☾ Theme";
  });

  // Connection
  $("connect-api").addEventListener("click",connect);
  $("pair-agent").addEventListener("click",pairLocalAgent);
  $("disconnect-api").addEventListener("click",disconnect);

  // Real operational actions
  $("run-health").addEventListener("click",async()=>{
    await runAction("/api/actions/health-check","monitor-output","Health check",
      "Run scripts/sysguard.sh on the Linux host? It may attempt to restart inactive services.");
    await loadTab("monitor");
  });
  $("run-backup").addEventListener("click",async()=>{
    const result=await runAction("/api/actions/backup","backup-output","Backup",
      "Run scripts/backup.sh and create a real archive on the Linux host?");
    if(result) await loadTab("backup");
  });
  $("run-report").addEventListener("click",async()=>{
    const result=await runAction("/api/actions/report","report-output","Health report",
      "Run scripts/health-report.sh and create a real health report?");
    if(result) await loadTab("report");
  });
  $("reload-services").addEventListener("click",()=>loadTab("monitor"));
  $("reload-backups").addEventListener("click",()=>loadTab("backup"));
  $("reload-reports").addEventListener("click",()=>loadTab("report"));
  $("load-logs").addEventListener("click",loadLogs);
  $("run-tests").addEventListener("click",()=>{
    if(!state.connected) return toast("Connect to the local agent to run endpoint checks.",true);
    runEndpointTests();
  });
  $("save-config").addEventListener("click",saveConfig);

  renderCommands();
  setConnection(false,"Checking agent…");
  if(localMode) {
    bootstrapLocalAgent();
  } else {
    navigate(location.hash.slice(1)||"overview");
  }
})();
