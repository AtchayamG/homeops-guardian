@echo off
setlocal
echo === Testing HomeOps Guardian MCP Server ===
call "%~dp0test-mcp.cmd"
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Server tests failed!
    exit /b %ERRORLEVEL%
)

if exist "%~dp0..\apps\simulator\package.json" (
    echo.
    echo === Typechecking and Building Simulator Web App ===
    cd /d "%~dp0..\apps\simulator"
    if not exist node_modules (
        call npm install
    )
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo [FAIL] Simulator build failed!
        exit /b %ERRORLEVEL%
    )
)
echo.
echo === ALL SUITES GREEN ===
exit /b 0
endlocal
