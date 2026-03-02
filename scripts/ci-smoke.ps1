Write-Host "--- CI Smoke Test: Server-side Noir Verification ---"

# 1. Ensure project is built
if (-not (Test-Path "dist")) {
    Write-Error "Error: dist directory not found. Run pnpm build first."
    exit 1
}

# 2. Start local workers server in background
Write-Host "Starting local Cloudflare Workers server..."
$wranglerJob = Start-Job -ScriptBlock { npx wrangler pages dev dist --port 8788 }
$WRANGLER_PID = $wranglerJob.Id

# Function to cleanup on exit
function Cleanup {
    Write-Host "Cleaning up..."
    Stop-Job -Id $WRANGLER_PID
    Remove-Job -Id $WRANGLER_PID
}

try {
    # 3. Wait for server to be ready
    Write-Host "Waiting for server to be ready on port 8788..."
    $maxRetries = 30
    $count = 0
    $ready = $false
    while (-not $ready -and $count -lt $maxRetries) {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8788" -Method Get -TimeoutSec 1 -ErrorAction Stop
            $ready = $true
        } catch {
            Start-Sleep -Seconds 1
            $count++
        }
    }

    if (-not $ready) {
        Write-Error "Error: Server failed to start in time."
        exit 1
    }
    Write-Host "Server is UP."

    # 4. Perform a verification request
    Write-Host "Sending ZK verification request..."
    $body = @{
        type = "zk"
        proof = "0x00"
        session_key = "dummy"
        room_id = "builders"
    } | ConvertTo-Json

    $resp = Invoke-RestMethod -Uri "http://localhost:8788/api/chat/auth/verify" -Method Post -Body $body -ContentType "application/json"
    $responseStr = $resp | ConvertTo-Json

    Write-Host "Response received: $responseStr"

    # Check if it crashed
    if ($responseStr -like "*Internal Server Error*") {
        Write-Error "FAILED: Server-side crash during ZK verification."
        exit 1
    }

    if ($responseStr -like "*instantiateStreaming*") {
        Write-Error "FAILED: instantiateStreaming error detected in response."
        exit 1
    }

    Write-Host "SUCCESS: Server-side ZK verification logic loaded and executed without crashing."
} finally {
    Cleanup
}
