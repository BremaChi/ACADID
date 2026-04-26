@echo off
cd /d "%~dp0.."
if not exist logs mkdir logs
start "acadid-web" /min cmd /c ""C:\Program Files\nodejs\npm.cmd" run dev --workspace @acadid/web > logs\web-dev.cmd.log 2>&1"
