@echo off
REM Launcher for the MCP server, called by run-both-detached.cmd. Runs from
REM source via `npm start` (tsx src/index.ts) - the same entry point a
REM developer uses by hand, so there is only ever one code path. See the
REM comment block in run-both-detached.cmd for why that matters.
setlocal
cd /d "%~dp0..\services\mcp-server"
call npm start
endlocal
