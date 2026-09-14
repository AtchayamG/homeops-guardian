@echo off
REM Bring up BOTH halves of Project 3 in their own detached consoles so a
REM verification pass can drive the simulator against the real server without
REM either one dying when a tool call returns.
REM   3001 - HomeOps Guardian MCP server (Streamable HTTP)
REM   4173 - the simulated Alexa+ client, served from its production build
setlocal
set "P=D:\Work\Codex\Hackathon Projects\Amazon Developer Hackathon\projects\03-alexa-mcp"

echo === stopping anything already on 3001 / 4173 ===
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo === MCP server, detached ===
start "MCP Server" /min cmd /c "cd /d ""%P%\services\mcp-server"" && node dist\index.js > ""%P%\ops\server-live.log"" 2>&1"

echo === simulator preview, detached ===
REM npm run preview, not a bare `npx vite preview`: npx in a detached console
REM resolved nothing here and died silently, leaving port 4173 dark and no log.
REM The package script already pins port and host.
start "Sim Preview" /min cmd /c "cd /d ""%P%\apps\simulator"" && npm run preview > ""%P%\ops\sim-preview.log"" 2>&1"

ping -n 12 127.0.0.1 >nul
echo === listening ports ===
netstat -ano | findstr LISTENING | findstr ":3001"
netstat -ano | findstr LISTENING | findstr ":5173"
echo === server health ===
curl -s -m 10 http://127.0.0.1:3001/health
echo.
echo === simulator page served? ===
curl -s -m 10 -o NUL -w "HTTP %%{http_code}\n" http://127.0.0.1:5173/
endlocal
