@echo off
REM Verification of the live transport against a server started FROM SOURCE.
REM This script used to start `node dist\index.js`, so it verified whatever
REM tsc last emitted rather than what the repository contains - and it
REM cheerfully reported a clean handshake from a server whose protocol floor
REM was still the pre-fix behaviour. tests/ops-entrypoints.test.ts is what
REM caught it here, and what keeps it from coming back.
setlocal
set "P=%~dp0.."
cd /d "%P%\services\mcp-server"
echo === starting server detached, from source ===
start "MCP Server" /min "%~dp0_launch-server.cmd"
REM tsx has to transpile before it listens, so this wait is longer than the
REM 5s that sufficed for prebuilt `node dist`.
ping -n 11 127.0.0.1 >nul
echo === health ===
curl -s -m 10 http://127.0.0.1:3001/health
echo.
echo === initialize (real round-trip) ===
curl -s -m 10 -D "%P%\ops\init-headers.txt" -X POST http://127.0.0.1:3001/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\",\"capabilities\":{},\"clientInfo\":{\"name\":\"claude-orchestrator-verify\",\"version\":\"1.0\"}}}"
echo.
echo === response headers (looking for Mcp-Session-Id) ===
type "%P%\ops\init-headers.txt"
echo === spec negative test: missing Accept header should be rejected ===
curl -s -m 10 -o NUL -w "HTTP %%{http_code}\n" -X POST http://127.0.0.1:3001/mcp -H "Content-Type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"initialize\",\"params\":{}}"
echo === stopping server ===
taskkill /F /FI "WINDOWTITLE eq MCP Server*" >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo done
endlocal
