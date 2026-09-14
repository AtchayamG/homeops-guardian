@echo off
setlocal
set P=D:\Work\Codex\Hackathon Projects\Amazon Developer Hackathon\projects\03-alexa-mcp
cd /d "%P%\services\mcp-server"
echo === starting server detached ===
start "MCP Server" /min cmd /c "node dist\index.js > "%P%\ops\server-live.log" 2>&1"
ping -n 6 127.0.0.1 >nul
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
