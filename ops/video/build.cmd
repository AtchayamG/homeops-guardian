@echo off
REM Assembles and then verifies, in one call, writing both logs to files so a
REM long ffmpeg run cannot outlive a tool timeout and leave the result unknown.
setlocal
cd /d "%~dp0..\.."
node ops\video\assemble.mjs > "%~dp0assemble.log" 2>&1
echo assemble exit %ERRORLEVEL%
type "%~dp0assemble.log" | findstr /v /c:"frame=" /c:"size="
endlocal
