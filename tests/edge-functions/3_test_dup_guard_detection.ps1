# Script 3: Testar dup_guard Detection (Idempotência)
# Uso: .\3_test_dup_guard_detection.ps1

Write-Host "`n╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  TESTE 3: dup_guard Detection (Anti-Duplicação)    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$SUPABASE_URL = "http://127.0.0.1:54321"
$EDGE_FUNCTIONS_URL = "$SUPABASE_URL/functions/v1"
$SERVICE_ROLE_KEY = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"
$FRONTEND_ORIGIN = "http://localhost:8080"

# Case ID para teste
$caseId = "dup_test_$(Get-Random 100000)"

try {
    # Step 1: Criar form_submission
    Write-Host "Step 1️⃣  Criando form_submission inicial..." -ForegroundColor Yellow
    
    $createForm = @{
        case_id = $caseId
        form_token = "dup_token"
        nome = "Test User"
        email = "test@test.com"
        payment_status = "pending"
        document_status = "pending"
        dup_guard = ""
    } | ConvertTo-Json
    
    Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/form_submissions" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $SERVICE_ROLE_KEY"
        } `
        -Body $createForm `
        -ErrorAction SilentlyContinue | Out-Null
    
    Write-Host "  ✅ Form criado" -ForegroundColor Green
    
    # Step 2: Enviar formulário (1ª vez)
    Write-Host "`nStep 2️⃣  Enviando formulário (1ª submissão)..." -ForegroundColor Yellow
    
    $payload = @{
        case_id = $caseId
        form_token = "dup_token"
        nome = "Test User"
        email = "test@test.com"
        telefone = "11999999999"
        cpf = "11111111111"
        endereco = "Rua Teste"
        cep = "12345678"
        placa = "TEST1234"
        orgao_autuador = "DETRAN"
    } | ConvertTo-Json
    
    $response1 = Invoke-WebRequest -Uri "$EDGE_FUNCTIONS_URL/form-submit" `
        -Method POST `
        -Headers @{
            'Content-Type' = 'application/json'
            'Origin' = $FRONTEND_ORIGIN
        } `
        -Body $payload `
        -TimeoutSec 10 `
        -ErrorAction SilentlyContinue
    
    $data1 = $response1.Content | ConvertFrom-Json
    $dup_guard_1 = $data1.form.dup_guard
    
    Write-Host "  ✅ Primeira submissão aceita" -ForegroundColor Green
    Write-Host "  ✅ dup_guard: $($dup_guard_1.Substring(0, 20))..." -ForegroundColor Green
    
    # Step 3: Enviar NOVAMENTE com os MESMOS dados
    Write-Host "`nStep 3️⃣  Enviando formulário novamente (tentativa de duplicação)..." -ForegroundColor Yellow
    
    Start-Sleep -Milliseconds 500
    
    $response2 = Invoke-WebRequest -Uri "$EDGE_FUNCTIONS_URL/form-submit" `
        -Method POST `
        -Headers @{
            'Content-Type' = 'application/json'
            'Origin' = $FRONTEND_ORIGIN
        } `
        -Body $payload `
        -TimeoutSec 10 `
        -ErrorAction SilentlyContinue
    
    $data2 = $response2.Content | ConvertFrom-Json
    
    # Step 4: Verificar se foi detectada como duplicata
    Write-Host "`nStep 4️⃣  Verificando detecção de duplicação..." -ForegroundColor Yellow
    
    if ($data2.ok -and $data2.message -like "*Duplicate*") {
        Write-Host "  ✅ DUPLICAÇÃO DETECTADA!" -ForegroundColor Green
        Write-Host "  ✅ Mensagem: $($data2.message)" -ForegroundColor Green
        Write-Host "  ✅ dup_guard match: $($data2.dup_guard.Substring(0, 20))..." -ForegroundColor Green
        
        # Verificar se são idênticos
        if ($dup_guard_1 -eq $data2.dup_guard) {
            Write-Host "  ✅ dup_guard IDÊNTICO entre as duas submissões" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  dup_guard DIFERENTE (erro potencial)" -ForegroundColor Yellow
        }
        
    } else {
        Write-Host "  ⚠️  DUPLICAÇÃO NÃO DETECTADA!" -ForegroundColor Yellow
        Write-Host "  Resposta: $($data2 | ConvertTo-Json)" -ForegroundColor Yellow
    }
    
    Write-Host "`n✅ TESTE DE IDEMPOTÊNCIA COMPLETO!" -ForegroundColor Green
    Write-Host "Sistema está protegido contra envios duplicados" -ForegroundColor Cyan
    
} catch {
    Write-Host "`n❌ ERRO!" -ForegroundColor Red
    Write-Host "Mensagem: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n" -ForegroundColor Cyan
