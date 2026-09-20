# 🔧 Solução - Erro de Porta do Docker no Windows

## ❌ Problema

```
failed to start docker container: Error response from daemon: 
ports are not available: exposing port TCP 0.0.0.0:54327 -> 127.0.0.1:0: 
listen tcp 0.0.0.0:54327: bind: An attempt was made to access a socket 
in a way forbidden by its access permissions.
```

**Causa:** Problema de permissões do Docker Desktop no Windows com WSL2.

---

## ✅ Solução - Execute como Administrator

### **Passo 1: Abra PowerShell como Administrator**

1. Pressione `Windows + X`
2. Selecione **"Windows PowerShell (Admin)"** ou **"Terminal (Admin)"**
3. Clique em **"Sim"** quando pedido

### **Passo 2: Navegue até o projeto**

```powershell
cd C:\Users\klaus\Coding\Atlas\amorecorrer.com
```

### **Passo 3: Reinicie Docker completamente**

```powershell
# Parar tudo
npx supabase stop
docker stop $(docker ps -q) 2>$null

# Aguarde 5 segundos
Start-Sleep -Seconds 5

# Reinicie Docker Desktop (ou reinicie o daemon)
Restart-Service docker -Force 2>$null

# Aguarde 10 segundos
Start-Sleep -Seconds 10

# Inicie novamente
npx supabase start
```

### **Passo 4: Se ainda não funcionar, limpe tudo**

```powershell
# Parar Supabase
npx supabase stop

# Remover todos os volumes Docker
docker volume rm $(docker volume ls -q --filter label=com.supabase.cli.project=tsdzvxgkokrjqayxukud)

# Reiniciar
npx supabase start
```

---

## 🚀 Alternativa - Usar Supabase Cloud (Recomendado para Produção)

Se o Docker Desktop continuar com problemas, considere usar o **Supabase Cloud** para testes:

```powershell
npx supabase link --project-ref=tsdzvxgkokrjqayxukud
npx supabase functions serve --env-file supabase/.env.local
```

---

## 📋 Verificação Pós-Solução

Após executar `npx supabase start`, você deve ver:

```
✔ API URL: http://127.0.0.1:54321
✔ Studio URL: http://127.0.0.1:54323
✔ Database URL: postgresql://postgres:postgres@127.0.0.1:5433/postgres
```

---

## ⚠️ Nota Importante

Se usou a porta alternativa `5433`:

1. **Atualizar `.env.local`** se necessário (mas Supabase gerencia automaticamente)
2. **Verificar conexão** com: `psql postgresql://postgres:postgres@127.0.0.1:5433/postgres`

