@echo off
setlocal
cd /d "%~dp0..\services\mcp-server"
echo [HomeOps] Starting MCP Server over Streamable HTTP...
call npm start
endlocal
