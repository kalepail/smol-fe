Param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectName,

  [Parameter(Mandatory = $true)]
  [string]$ProverUrl,

  [Parameter(Mandatory = $true)]
  [string]$ProverApiKey,

  [Parameter(Mandatory = $false)]
  [int]$TimeoutMs = 300000
)

$ErrorActionPreference = "Stop"

Write-Host "[pages] setting secrets for project '$ProjectName'..."

function Put-Secret([string]$Key, [string]$Value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $ms = New-Object System.IO.MemoryStream
  $ms.Write($bytes, 0, $bytes.Length) | Out-Null
  $ms.Position = 0

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "npx"
  $psi.ArgumentList.Add("--yes")
  $psi.ArgumentList.Add("wrangler")
  $psi.ArgumentList.Add("pages")
  $psi.ArgumentList.Add("secret")
  $psi.ArgumentList.Add("put")
  $psi.ArgumentList.Add($Key)
  $psi.ArgumentList.Add("--project-name")
  $psi.ArgumentList.Add($ProjectName)
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false

  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  $p.Start() | Out-Null

  $sw = $p.StandardInput
  $sw.WriteLine($Value)
  $sw.Close()

  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()

  if ($p.ExitCode -ne 0) {
    throw "wrangler failed for $Key: $stderr"
  }
  if ($stdout) { Write-Host $stdout.Trim() }
}

Put-Secret -Key "PROVER_URL" -Value $ProverUrl
Put-Secret -Key "PROVER_API_KEY" -Value $ProverApiKey
Put-Secret -Key "PROVER_TIMEOUT_MS" -Value ([string]$TimeoutMs)

Write-Host "[pages] done. verify with:"
Write-Host "  npx wrangler pages secret list --project-name $ProjectName"

