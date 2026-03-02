<# 
THE FARM Watchdog

- Reads smol-fe/THE_FARM_LOG.md (or a provided -LogPath)
- Relays new Message: content to Telegram (via `openclaw message send`)
- Nudges if Active Agent stalls beyond a cooldown
- Notifies if HandoffTo is main

This script is designed to be run non-interactively (e.g., via Windows Task Scheduler).
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$LogPath,

  [Parameter(Mandatory = $false)]
  [string]$StatePath,

  [Parameter(Mandatory = $false)]
  [string]$TelegramChatId,

  [Parameter(Mandatory = $false)]
  [string]$TelegramAccount = "default",

  [Parameter(Mandatory = $false)]
  [int]$NudgeCooldownMinutes = 120,

  # If the agent remains stalled, re-nudge at most once per this window.
  [Parameter(Mandatory = $false)]
  [int]$NudgeRepeatMinutes = 120,

  [Parameter(Mandatory = $false)]
  [switch]$AppendNudgeToLog,

  [Parameter(Mandatory = $false)]
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DefaultLogPath {
  $candidate = Join-Path $PSScriptRoot "../../THE_FARM_LOG.md"
  if (Test-Path -LiteralPath $candidate) {
    return (Resolve-Path -LiteralPath $candidate).Path
  }

  $candidate = Join-Path $PWD "THE_FARM_LOG.md"
  if (Test-Path -LiteralPath $candidate) {
    return (Resolve-Path -LiteralPath $candidate).Path
  }

  throw "Unable to find THE_FARM_LOG.md. Provide -LogPath."
}

function Get-DefaultStatePath {
  $coordDir = Join-Path $env:USERPROFILE ".openclaw/coordination"
  return (Join-Path $coordDir "the-farm-watchdog-state.json")
}

function Ensure-DirForFile([string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

function Load-State([string]$path) {
  $defaults = @{
    lastRelayHash = $null
    lastRelayAtUtc = $null
    lastNudgeAtUtc = $null
    lastNudgeForStatusUtc = $null
    lastHandoffAtUtc = $null
    lastHandoffForStatusUtc = $null
    lastErrorAtUtc = $null
    lastErrorHash = $null
  }

  if (-not (Test-Path -LiteralPath $path)) {
    return $defaults
  }

  $raw = Get-Content -LiteralPath $path -Raw
  if (-not $raw) {
    return $defaults
  }

  # PowerShell 5.1 does not support ConvertFrom-Json -AsHashtable.
  $obj = $raw | ConvertFrom-Json
  if ($obj -and $obj.PSObject -and $obj.PSObject.Properties) {
    foreach ($p in $obj.PSObject.Properties) {
      $defaults[$p.Name] = $p.Value
    }
  }

  return $defaults
}

function Save-State([string]$path, [hashtable]$state) {
  Ensure-DirForFile $path
  $tmp = "$path.tmp"
  $json = ($state | ConvertTo-Json -Depth 8)
  Set-Content -LiteralPath $tmp -Value $json -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

function Save-StateMaybe([string]$path, [hashtable]$state) {
  if ($DryRun) {
    return
  }
  Save-State $path $state
}

function Sha256Hex([string]$s) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($s)
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Split-AgentList([string]$s) {
  if (-not $s) { return @() }
  $parts = $s -split "[/,\s]+" | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ }
  return @($parts)
}

function Try-ParseUtc([string]$s) {
  try {
    return [DateTimeOffset]::Parse($s, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal)
  } catch {
    return $null
  }
}

function OpenClaw-SendTelegram([string]$text) {
  if (-not $TelegramChatId) {
    throw "TelegramChatId is required (or configure channels.telegram.allowFrom in OpenClaw)."
  }

  if ($DryRun) {
    Write-Output ("DRYRUN telegram send: " + $text)
    return
  }

  # Use openclaw.cmd (not openclaw.ps1) to avoid PowerShell argument parsing issues with `--flags`.
  & openclaw.cmd message send `
    --channel telegram `
    --account $TelegramAccount `
    --target $TelegramChatId `
    --message $text `
    --json | Out-Null
}

function Maybe-NotifyError([hashtable]$state, [string]$errorText) {
  $now = [DateTimeOffset]::UtcNow
  $hash = Sha256Hex($errorText)

  $lastHash = $state.lastErrorHash
  $lastAt = Try-ParseUtc($state.lastErrorAtUtc)
  $should = $false

  if (-not $lastHash -or $lastHash -ne $hash) { $should = $true }
  if (-not $lastAt) { $should = $true }
  if ($lastAt -and ($now - $lastAt).TotalMinutes -ge 360) { $should = $true } # 6h cooldown

  if ($should) {
    OpenClaw-SendTelegram ("⚠️ [WATCHDOG] " + $errorText)
    $state.lastErrorHash = $hash
    $state.lastErrorAtUtc = $now.ToString("yyyy-MM-ddTHH:mm:ssZ")
  }
}

if (-not $LogPath) { $LogPath = Get-DefaultLogPath }
if (-not $StatePath) { $StatePath = Get-DefaultStatePath }

# Resolve TelegramChatId from OpenClaw config if not provided.
if (-not $TelegramChatId) {
  try {
    $allowFromJson = & openclaw.cmd config get channels.telegram.allowFrom --json 2>$null
    $allowFrom = $allowFromJson | ConvertFrom-Json
    if ($allowFrom -and $allowFrom.Count -gt 0) {
      $TelegramChatId = [string]$allowFrom[0]
    }
  } catch {
    # ignore; we'll error later if still missing and we need to send.
  }
}

$state = Load-State $StatePath
$now = [DateTimeOffset]::UtcNow

try {
  # Force UTF-8 so Windows PowerShell 5.1 doesn't mis-decode Unicode arrows.
  $lines = Get-Content -LiteralPath $LogPath -Encoding UTF8
} catch {
  Maybe-NotifyError $state ("Missing log file: " + $LogPath)
  Save-StateMaybe $StatePath $state
  exit 0
}

$statusLineRe = '^\[UTC:(?<ts>[^\]]+)\]\s*Active Agent:\s*(?<active>.+?)\s*(?:->|\u2192)\s*HandoffTo:\s*(?<handoff>.+?)\s*$'

$idx = -1
$tsRaw = $null
$activeRaw = $null
$handoffRaw = $null
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
  $line = $lines[$i]
  if ($line -match $statusLineRe) {
    $idx = $i
    $tsRaw = $Matches["ts"].Trim()
    $activeRaw = $Matches["active"].Trim()
    $handoffRaw = $Matches["handoff"].Trim()
    break
  }
}

if ($idx -lt 0) {
  Maybe-NotifyError $state ("No status block found in log (expected '[UTC:...] Active Agent: ... -> HandoffTo: ...'). Path: " + $LogPath)
  Save-StateMaybe $StatePath $state
  exit 0
}

$ts = Try-ParseUtc $tsRaw
if (-not $ts) {
  Maybe-NotifyError $state ("Invalid UTC timestamp in status line: " + $tsRaw)
  Save-StateMaybe $StatePath $state
  exit 0
}

$statusText = $null
$messageText = $null
for ($j = $idx + 1; $j -lt $lines.Count; $j++) {
  $line = $lines[$j]
  if ($line -match $statusLineRe) { break }

  if (-not $statusText -and $line -match '^\s*Status:\s*(?<v>.*)\s*$') {
    $statusText = $Matches["v"].Trim()
    continue
  }
  if (-not $messageText -and $line -match '^\s*Message:\s*(?<v>.*)\s*$') {
    $messageText = $Matches["v"].Trim()
    continue
  }
}

$activeAgents = Split-AgentList $activeRaw
$handoffAgents = Split-AgentList $handoffRaw
$ageMinutes = [math]::Floor(($now - $ts).TotalMinutes)

$didRelay = $false
$didNudge = $false
$didHandoff = $false

if ($messageText) {
  $relayHash = Sha256Hex("$activeRaw|$handoffRaw|$messageText")
  if (-not $state.lastRelayHash -or $state.lastRelayHash -ne $relayHash) {
    OpenClaw-SendTelegram ("🤖 [RELAY] $activeRaw says:`n`"$messageText`"")
    $state.lastRelayHash = $relayHash
    $state.lastRelayAtUtc = $now.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $didRelay = $true
  }
}

# Handoff notification: main has something to do now.
if ($handoffAgents -contains "main") {
  if (-not $state.lastHandoffForStatusUtc -or $state.lastHandoffForStatusUtc -ne $tsRaw) {
    OpenClaw-SendTelegram ("🟢 Action Required: It is YOUR TURN on THE FARM.`n(Active: $activeRaw, Updated: $tsRaw)")
    $state.lastHandoffForStatusUtc = $tsRaw
    $state.lastHandoffAtUtc = $now.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $didHandoff = $true
  }
}

# Nudge notification: codex/antigravity stalled.
# Interpretation: HandoffTo indicates whose turn it is now.
$isStallCandidate = ($handoffAgents -contains "codex") -or ($handoffAgents -contains "antigravity")
if ($isStallCandidate -and $ageMinutes -ge $NudgeCooldownMinutes) {
  $lastNudgeAt = Try-ParseUtc $state.lastNudgeAtUtc
  $shouldNudge = $false

  if (-not $state.lastNudgeForStatusUtc -or $state.lastNudgeForStatusUtc -ne $tsRaw) { $shouldNudge = $true }
  if (-not $lastNudgeAt) { $shouldNudge = $true }
  if ($lastNudgeAt -and ($now - $lastNudgeAt).TotalMinutes -ge $NudgeRepeatMinutes) { $shouldNudge = $true }

  if ($shouldNudge) {
    OpenClaw-SendTelegram ("⚠️ ALERT: $handoffRaw - Status? You're blocking the relay. (Stalled for > $NudgeCooldownMinutes min; last update $tsRaw)")
    $state.lastNudgeForStatusUtc = $tsRaw
    $state.lastNudgeAtUtc = $now.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $didNudge = $true

    if ($AppendNudgeToLog) {
      $append = @()
      $append += ""
      $append += ("[UTC:{0}] Active Agent: {1} -> HandoffTo: {1}" -f $now.ToString("yyyy-MM-ddTHH:mm:ssZ"), $activeRaw)
      $append += "Status: WATCHDOG NUDGE. Stalled."
      $append += "Message: Wake up!"
      Add-Content -LiteralPath $LogPath -Value ($append -join [Environment]::NewLine) -Encoding UTF8
    }
  }
}

Save-StateMaybe $StatePath $state

$summary = @(
  ("[UTC:{0}] Watchdog ok" -f $now.ToString("yyyy-MM-ddTHH:mm:ssZ")),
  ("Log: {0}" -f $LogPath),
  ("StatusUTC: {0} (age {1}m)" -f $tsRaw, $ageMinutes),
  ("Active: {0} | HandoffTo: {1}" -f $activeRaw, $handoffRaw),
  ("Actions: relay={0} handoff={1} nudge={2}" -f $didRelay, $didHandoff, $didNudge)
) -join " | "

Write-Output $summary
