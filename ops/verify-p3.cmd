@echo off
set P=D:\Work\Codex\Hackathon Projects\Amazon Developer Hackathon\projects\03-alexa-mcp
echo === files delivered ===
powershell -NoProfile -Command "Get-ChildItem '%P%' -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules' } | ForEach-Object { $_.FullName.Replace('%P%\','')+'  '+$_.Length+'B' }"
echo.
echo === does the server source really implement Streamable HTTP? ===
powershell -NoProfile -Command "Select-String -Path '%P%\services\mcp-server\src\*.ts' -Pattern 'Mcp-Session-Id|text/event-stream|protocolVersion|2025-11-25|POST|GET|DELETE' | ForEach-Object { $_.Filename+':'+$_.LineNumber+': '+$_.Line.Trim() } | Select-Object -First 20"
echo.
echo === any hardcoded/fake response or mock in server source? ===
powershell -NoProfile -Command "Select-String -Path '%P%\services\mcp-server\src\*.ts' -Pattern 'mock|fake|stub|TODO|hardcode' | ForEach-Object { $_.Filename+':'+$_.LineNumber+': '+$_.Line.Trim() }"
