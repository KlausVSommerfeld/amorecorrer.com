# Script 2: Testar form-submit
# Uso: .\2_test_form_submit.ps1

Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  TESTE 2: form-submit (dados completos)            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$SUPABASE_URL = "http://127.0.0.1:54321"
$EDGE_FUNCTIONS_URL = "$SUPABASE_URL/functions/v1"
$SERVICE_ROLE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
$FRONTEND_ORIGIN = "http://localhost:8080"

# Case ID para teste
$caseId = "test_case_$(Get-Random 100000)"

try {
    # Step 1: Criar form_submission no banco
    Write-Host "Step 1️⃣  Criando form_submission no banco..." -ForegroundColor Yellow
    
    $createForm = @{
        case_id = $caseId
        form_token = "token_$(Get-Random)"
        nome = "Wilson Witzel"
        email = "wilson@test.com"
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
    } else {
        throw "Falha ao criar form_submission: $($createResp.StatusCode)"
    }
    
    # Step 2: Enviar dados via form-submit
    Write-Host "`nStep 2️⃣  Enviando dados via form-submit..." -ForegroundColor Yellow
    
    $startTime = Get-Date
    $payload = @{
        case_id = $caseId
        form_token = "token_test"
        nome = "Wilson Witzel"
        email = "wilson@test.com"
        telefone = "(21) 98649-6452"
        cpf = "12345678900"
        endereco = "Rua Test 123"
        cep = "22793266"
        placa = "ABC1234"
        orgao_autuador = "DETRAN"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$EDGE_FUNCTIONS_URL/form-submit" `
        -Method POST `
        -Headers @{
            'Content-Type' = 'application/json'
            'Origin' = $FRONTEND_ORIGIN
        } `
        -Body $payload `
        -TimeoutSec 10 `
        -ErrorAction SilentlyContinue
    
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalMilliseconds
    
    $data = $response.Content | ConvertFrom-Json
    
    Write-Host "  ✅ Resposta recebida em ${duration}ms" -ForegroundColor Green
    
    # Step 3: Validar resposta
    Write-Host "`nStep 3️⃣  Validando resposta..." -ForegroundColor Yellow
    
    if ($data.ok) {
        Write-Host "  ✅ Status OK" -ForegroundColor Green
        Write-Host "  ✅ Form ID: $($data.form.id)" -ForegroundColor Green
        Write-Host "  ✅ dup_guard: $($data.form.dup_guard.Substring(0, 20))..." -ForegroundColor Green
        Write-Host "  ✅ Case ID: $($data.form.case_id)" -ForegroundColor Green
        
        if ($data.form.updated_at) {
            Write-Host "  ✅ updated_at registrado" -ForegroundColor Green
        }
        
    } else {
        throw "Erro na resposta: $($data.error)"
    }
    
    Write-Host "`n✅ TESTE COMPLETO COM SUCESSO!" -ForegroundColor Green
    Write-Host "Dados enviados: Nome, Email, Telefone, CPF, Endereço, CEP, Placa, Órgão Autuador" -ForegroundColor Cyan
    
} catch {
    Write-Host "`n❌ ERRO!" -ForegroundColor Red
    Write-Host "Mensagem: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n" -ForegroundColor Cyan
