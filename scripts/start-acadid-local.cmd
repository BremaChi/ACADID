@echo off
setlocal
cd /d "%~dp0.."

if not exist logs mkdir logs

echo Starting ACAD.ID local development...
echo.
echo Web: http://localhost:3000
echo API: http://localhost:4000/api/health
echo Logs:
echo   logs\api-dev.cmd.log
echo   logs\web-dev.cmd.log
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found on PATH. Install Node.js or open this from a Node-enabled terminal.
  exit /b 1
)

if "%JWT_SECRET%"=="" set JWT_SECRET=local-development-secret-change-before-pilot
if "%PORT%"=="" set PORT=4000

call :is_up http://localhost:4000/api/health
if errorlevel 1 (
  echo Starting API on port 4000...
  start "acadid-api" /min cmd /c "npm run dev --workspace @acadid/api > logs\api-dev.cmd.log 2>&1"
) else (
  echo API is already running on port 4000.
)

call :is_up http://localhost:3000
if errorlevel 1 (
  echo Starting web app on port 3000...
  start "acadid-web" /min cmd /c "npm run dev --workspace @acadid/web > logs\web-dev.cmd.log 2>&1"
) else (
  echo Web app is already running on port 3000.
)

echo Waiting for the local web server...
for /l %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 2 /nobreak >nul
)

echo ACAD.ID is still starting. Check logs\web-dev.cmd.log and logs\api-dev.cmd.log.
exit /b 0

:ready
echo ACAD.ID web is ready at http://localhost:3000
start "" "http://localhost:3000"
exit /b 0

:is_up
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%~1' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } } catch {}; exit 1" >nul 2>nul
exit /b %errorlevel%
