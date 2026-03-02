# scripts/deploy-vip.ps1
# This script ensures the vip-worker is deployed to your active Cloudflare account 
# and restores the binding in the main wrangler.toml.

Write-Host "🚀 Deploying VIP Worker..." -ForegroundColor Cyan
cd vip-worker
pnpm install
pnpm run deploy
cd ..

Write-Host "🛠️ Restoring Durable Object binding in wrangler.toml..." -ForegroundColor Cyan
$tomlPath = "wrangler.toml"
$content = Get-Content $tomlPath
$newContent = $content -replace '# \[durable_objects\]', '[durable_objects]'
$newContent = $newContent -replace '# bindings = \[', 'bindings = ['
$newContent = $newContent -replace '#   \{ name = "VIP_ROOMS", class_name = "RoomsDO", script_name = "vip-worker" \}', '  { name = "VIP_ROOMS", class_name = "RoomsDO", script_name = "vip-worker" }'
$newContent = $newContent -replace '# \]', ']'
$newContent | Out-File $tomlPath -Encoding utf8

Write-Host "✅ Done! Push your changes to trigger the final Cloudflare build." -ForegroundColor Green
