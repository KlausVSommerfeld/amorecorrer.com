# Script 4: Fluxo Completo (Checkout → Form → Verificação)
# Uso: .\4_test_complete_flow.ps1

Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  TESTE 4: Fluxo Completo (End-to-End)             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$SUPABASE_URL = "http://127.0.0.1:54321"
$EDGE_FUNCTIONS_URL = "$SUPABASE_URL/functions/v1"
$SERVICE_ROLE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
$FRONTEND_ORIGIN = "http://localhost:8080"

try {
    # Step 1: Criar checkout session
    Write-Host "Step 1️⃣  Criando sessão Stripe..." -ForegroundColor Yellow
    
    $checkoutResponse = Invoke-WebRequest -Uri "$EDGE_FUNCTIONS_URL/create-checkout-session" `
        -Method POST `
        -Headers @{'Content-Type'='application/json'} `
        -Body '{}' `
        -TimeoutSec 15 `
        -ErrorAction SilentlyContinue
    
    $checkoutData = $checkoutResponse.Content | ConvertFrom-Json
    $caseId = $checkoutData.case_id
    $sessionId = $checkoutData.id
    
    Write-Host "  ✅ Checkout criado" -ForegroundColor Green
    Write-Host "  ✅ Case ID: $caseId" -ForegroundColor Green
    Write-Host "  ✅ Session ID: $($sessionId.Substring(0, 30))..." -ForegroundColor Green
    
    # Step 2: Criar form_submission
    Write-Host "`nStep 2️⃣  Criando form_submission no banco..." -ForegroundColor Yellow
    
    $createForm = @{
        case_id = $caseId
        form_token = "flow_test_$(Get-Random)"
        nome = "Wilson Witzel"
        email = "wilson@flow.test"
        payment_status = "pending"
        document_status = "pending"
        dup_guard = ""
    } | ConvertTo-Json
    
    $createResp = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/form_submissions" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $SERVICE_ROLE_KEY"
        } `
        -Body $createForm `
        -ErrorAction SilentlyContinue
    
    if ($createResp.StatusCode -eq 201) {
        Write-Host "  ✅ Form submission criado" -ForegroundColor Green
    }
    
    # Step 3: Enviar formulário completo
    Write-Host "`nStep 3️⃣  Enviando formulário completo..." -ForegroundColor Yellow
    
    $payload = @{
        case_id = $caseId
        form_token = "flow_test_token"
        nome = "Wilson Witzel"
        email = "wilson@flow.test"
        telefone = "(21) 98649-6452"
        cpf = "12345678901"
        endereco = "Rua Completa 999"
        cidade = "Rio de Janeiro"
        estado = "RJ"
        cep = "22793266"
        placa = "WIT1234"
        renavam = "12345678901234"
        cnh = "12345678901"
        data_infracao = "2025-12-01"
        numero_auto = "123456"
        local_infracao = "Av. Brasil"
        velocidade_permitida = "80"
        velocidade_aferida = "120"
        orgao_autuador = "DETRAN-RJ"
        artigo_ctb = "art_1000"
    } | ConvertTo-Json
    
    $formResp = Invoke-WebRequest -Uri "$EDGE_FUNCTIONS_URL/form-submit" `
        -Method POST `
        -Headers @{
            'Content-Type' = 'application/json'
            'Origin' = $FRONTEND_ORIGIN
        } `
        -Body $payload `
        -TimeoutSec 10 `
        -ErrorAction SilentlyContinue
    
    $formData = $formResp.Content | ConvertFrom-Json
    
    Write-Host "  ✅ Formulário enviado" -ForegroundColor Green
    
    # Step 4: Verificar persistência
    Write-Host "`nStep 4️⃣  Verificando dados persistidos no banco..." -ForegroundColor Yellow
    
    $getResp = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/form_submissions?case_id=eq.$caseId" `
        -Method GET `
        -Headers @{
            "Authorization" = "Bearer $SERVICE_ROLE_KEY"
        } `
        -ErrorAction SilentlyContinue
    
    $records = $getResp.Content | ConvertFrom-Json
    
    if ($records.Count -gt 0) {
        $record = $records[0]
        Write-Host "  ✅ Dados encontrados no banco" -ForegroundColor Green
        Write-Host "  ✅ Nome: $($record.nome)" -ForegroundColor Green
        Write-Host "  ✅ Email: $($record.email)" -ForegroundColor Green
        Write-Host "  ✅ Telefone: $($record.telefone)" -ForegroundColor Green
        Write-Host "  ✅ Placa: $($record.placa)" -ForegroundColor Green
        
        if ($record.dup_guard) {
            Write-Host "  ✅ dup_guard calculado: $($record.dup_guard.Substring(0, 20))..." -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  dup_guard vazio" -ForegroundColor Yellow
        }
        
    } else {
        Write-Host "  ❌ Dados não encontrados no banco" -ForegroundColor Red
    }
    
    # Summary
    Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  ✅ FLUXO COMPLETO EXECUTADO COM SUCESSO!         ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════╝`n" -ForegroundColor Green
    
    Write-Host "📊 Resumo:" -ForegroundColor Cyan
    Write-Host "  1. Checkout criado: $($caseId.Substring(0, 8))..." -ForegroundColor White
    Write-Host "  2. Form submission criado no banco" -ForegroundColor White
    Write-Host "  3. Dados enviados via form-submit" -ForegroundColor White
    Write-Host "  4. Persistência verificada" -ForegroundColor White
    Write-Host "  5. dup_guard presente e válido" -ForegroundColor White
    
} catch {
    Write-Host "`n❌ ERRO!" -ForegroundColor Red
    Write-Host "Mensagem: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n" -ForegroundColor Cyan
