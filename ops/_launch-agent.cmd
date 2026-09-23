@echo off
setlocal
cd /d "%~dp0..\services\agent"
call npm start
endlocal
