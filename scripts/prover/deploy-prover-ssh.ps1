Param(
  [Parameter(Mandatory = $true)]
  [string]$Host,

  [Parameter(Mandatory = $false)]
  [string]$User = "ubuntu",

  [Parameter(Mandatory = $false)]
  [string]$SshKeyPath = "",

  [Parameter(Mandatory = $false)]
  [string]$RepoUrl = "https://github.com/tacticalnoot/SMOL-FE.git",

  [Parameter(Mandatory = $false)]
  [string]$RepoRef = "main",

  [Parameter(Mandatory = $true)]
  [string]$ProverApiKey
)

$ErrorActionPreference = "Stop"

$sshArgs = @()
if ($SshKeyPath -and $SshKeyPath.Trim().Length -gt 0) {
  $sshArgs += "-i"
  $sshArgs += $SshKeyPath
}

$target = "$User@$Host"

Write-Host "[ssh] uploading env + running bootstrap on $target..."

$remoteEnv = @"
PROVER_BIND=0.0.0.0
PROVER_PORT=8788
PROVER_API_KEY=$ProverApiKey
RISC0_PROVER_TIMEOUT_MS=2700000
SMOL_FE_REPO_URL=$RepoUrl
SMOL_FE_REPO_REF=$RepoRef
"@

# Create env + run bootstrap from repo once cloned.
$cmd = @"
set -euo pipefail
sudo mkdir -p /etc
cat > /tmp/smol-prover.env <<'EOF'
$remoteEnv
EOF
sudo mv /tmp/smol-prover.env /etc/smol-prover.env

if [ ! -d /opt/smol-fe/.git ]; then
  sudo mkdir -p /opt
  sudo chown -R \$USER:\$USER /opt
  git clone --depth 50 '$RepoUrl' /opt/smol-fe
fi

cd /opt/smol-fe
git fetch --all --prune
git checkout '$RepoRef'

sudo bash infra/prover/bootstrap-ubuntu.sh
curl -s http://127.0.0.1:8788/health
"@

if ($sshArgs.Count -gt 0) {
  & ssh @sshArgs $target $cmd
} else {
  & ssh $target $cmd
}

Write-Host ""
Write-Host "[ssh] done. Prover should be running on http://$Host`:8788"

