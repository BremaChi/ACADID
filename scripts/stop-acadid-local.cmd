@echo off
setlocal

echo Stopping ACAD.ID local development windows...
taskkill /FI "WINDOWTITLE eq acadid-api*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq acadid-web*" /T /F >nul 2>nul

echo Checking common local ports...
for %%P in (3000 4000) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do (
    echo Stopping PID %%A on port %%P
    taskkill /PID %%A /T /F >nul 2>nul
  )
)

echo Done.
exit /b 0
