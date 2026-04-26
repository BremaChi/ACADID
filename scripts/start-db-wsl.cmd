@echo off
cd /d "%~dp0.."
for /f "usebackq delims=" %%i in (`wsl wslpath -a "%CD%"`) do set WSL_PROJECT_DIR=%%i
start "acadid-wsl-keepalive" /min wsl -u root -e sleep infinity
wsl -u root -e bash -lc "cd '%WSL_PROJECT_DIR%' && docker compose up -d postgres"
