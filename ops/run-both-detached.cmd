@echo off
REM Bring up BOTH halves of HomeOps Guardian in their own detached consoles so
REM the simulator can drive the real server without either one dying when a
REM tool call returns.
REM   3001 - HomeOps Guardian MCP server (Streamable HTTP)
REM   5173 - the simulated Alexa+ client
REM
REM Both halves run FROM SOURCE, deliberately.
REM
REM This script used to launch `node dist\index.js`, and that produced a
REM genuinely dangerous failure: `npm start` runs `tsx src/index.ts`, so the
REM server a developer starts by hand is the current source, while the server
REM this script started was whatever `tsc` last emitted. After the protocol
REM floor was fixed in src/server.ts and dist was not rebuilt, the two
REM disagreed - `ops\probe-protocol-version.mjs` against this script reported
REM the OLD behaviour (clients negotiating 2024-11-05) while the tests, which
REM run the source through tsx, were green. A judge following the walkthrough
REM would have been talking to a server the repository no longer contains.
REM One entry point, one code path, no stale artefact to serve by accident.
setlocal
set "P=%~dp0.."

echo === stopping anything already on 3001 / 5173 ===
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo === MCP server from source, detached ===
start "MCP Server" /min "%~dp0_launch-server.cmd"

echo === simulator dev server from source, detached ===
REM `npm run dev` rather than `preview`: preview serves apps/simulator/dist,
REM which is gitignored, so on a fresh clone it serves nothing and port 5173
REM comes up dark with no explanation. dev needs no prior build step.
start "Simulator" /min "%~dp0_launch-sim.cmd"

ping -n 14 127.0.0.1 >nul
echo === listening ports ===
netstat -ano | findstr LISTENING | findstr ":3001"
netstat -ano | findstr LISTENING | findstr ":5173"
echo === server health ===
curl -s -m 10 http://127.0.0.1:3001/health
echo.
echo === simulator page served? ===
curl -s -m 10 -o NUL -w "HTTP %%{http_code}" http://127.0.0.1:5173/
echo.
echo === protocol floor, against the server this script just started ===
node "%P%\ops\probe-protocol-version.mjs"
endlocal
