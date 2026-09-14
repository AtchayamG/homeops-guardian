@echo off
setlocal
cd /d "%~dp0..\services\mcp-server"
echo [HomeOps] Initializing test run... > "%~dp0test-run.log"
if not exist node_modules (
    echo [HomeOps] Installing dependencies... >> "%~dp0test-run.log"
    call npm install >> "%~dp0test-run.log" 2>&1
)
echo [HomeOps] Running test suite... >> "%~dp0test-run.log"
call npm test >> "%~dp0test-run.log" 2>&1
set TEST_EXIT=%ERRORLEVEL%
type "%~dp0test-run.log"
exit /b %TEST_EXIT%
endlocal
