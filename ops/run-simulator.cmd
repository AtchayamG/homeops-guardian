@echo off
setlocal
cd /d "%~dp0..\apps\simulator"
echo [HomeOps] Starting Alexa+ Simulator at http://127.0.0.1:5173 ...
call npm run dev
endlocal
