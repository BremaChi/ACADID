@echo off
cd /d "%~dp0.."
if not exist logs mkdir logs
if "%JWT_SECRET%"=="" set JWT_SECRET=local-development-secret-change-before-pilot
if "%PORT%"=="" set PORT=4000
start "acadid-api" /min cmd /c ""C:\Program Files\nodejs\npm.cmd" run build --workspace @acadid/api > logs\api-dev.cmd.log 2>&1 && "C:\Program Files\nodejs\npm.cmd" run start --workspace @acadid/api >> logs\api-dev.cmd.log 2>&1"
