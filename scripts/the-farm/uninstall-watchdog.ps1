<# 
Removes the THE FARM watchdog scheduled task.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$TaskName = "TheFarm Watchdog"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

schtasks /Delete /TN $TaskName /F | Out-Null
Write-Output "Removed scheduled task: $TaskName"

