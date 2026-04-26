@echo off
cd /d "%~dp0.."
if not exist logs mkdir logs
start "acadid-api" /min cmd /c ""C:\Program Files\nodejs\npm.cmd" run dev --workspace @acadid/api > logs\api-dev.cmd.log 2>&1"
