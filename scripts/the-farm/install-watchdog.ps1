<# 
Installs/updates the THE FARM watchdog as a Windows Scheduled Task.

Task runs only when the user is logged in (Interactive only) to avoid storing a password.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$TaskName = "TheFarm Watchdog",

  [Parameter(Mandatory = $false)]
  [int]$EveryMinutes = 30,

  [Parameter(Mandatory = $false)]
  [int]$NudgeCooldownMinutes = 120,

  [Parameter(Mandatory = $false)]
  [int]$NudgeRepeatMinutes = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "watchdog.ps1")).Path

if ($EveryMinutes -lt 1 -or $EveryMinutes -gt 1439) {
  throw "EveryMinutes must be 1..1439."
}

$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -NudgeCooldownMinutes $NudgeCooldownMinutes -NudgeRepeatMinutes $NudgeRepeatMinutes"

schtasks /Create `
  /TN $TaskName `
  /SC MINUTE `
  /MO $EveryMinutes `
  /TR $tr `
  /RU "$env:USERNAME" `
  /IT `
  /RL LIMITED `
  /F | Out-Null

Write-Output "Installed scheduled task: $TaskName (every ${EveryMinutes}m, nudge=${NudgeCooldownMinutes}m, repeat=${NudgeRepeatMinutes}m)"

