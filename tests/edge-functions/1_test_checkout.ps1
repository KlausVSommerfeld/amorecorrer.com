# Script 1: Testar create-checkout-session
# Uso: .\1_test_checkout.ps1

Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  TESTE 1: create-checkout-session                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$EDGE_FUNCTIONS_URL = "http://127.0.0.1:54321/functions/v1"
$startTime = Get-Date

try {
    Write-Host "📡 Enviando requisição para criar checkout..." -ForegroundColor Yellow
    
    $response = Invoke-WebRequest -Uri "$EDGE_FUNCTIONS_URL/create-checkout-session" `
        -Method POST `
        -Headers @{'Content-Type'='application/json'} `
        -Body '{}' `
        -TimeoutSec 15
    
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalMilliseconds
    
    $data = $response.Content | ConvertFrom-Json
    
    Write-Host "`n✅ SUCESSO!" -ForegroundColor Green
    Write-Host "Tempo de resposta: ${duration}ms" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📊 Dados recebidos:" -ForegroundColor Yellow
    Write-Host "  • case_id:     $($data.case_id)" -ForegroundColor White
    Write-Host "  • session_id:  $($data.id.Substring(0, 40))..." -ForegroundColor White
    Write-Host "  • checkout_url: $($data.url.Substring(0, 60))..." -ForegroundColor White
    
    Write-Host "`n✅ Validações:" -ForegroundColor Green
    if ($duration -lt 5000) {
        Write-Host "  ✅ Tempo de resposta OK (< 5s)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Tempo de resposta lento (> 5s)" -ForegroundColor Yellow
    }
    
    if ($data.case_id -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
        Write-Host "  ✅ case_id é UUID válido" -ForegroundColor Green
    } else {
        Write-Host "  ❌ case_id inválido" -ForegroundColor Red
    }
    
    if ($data.url -like "https://checkout.stripe.com/*") {
        Write-Host "  ✅ Checkout URL é válida" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Checkout URL inválida" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ ERRO!" -ForegroundColor Red
    Write-Host "Mensagem: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n" -ForegroundColor Cyan
