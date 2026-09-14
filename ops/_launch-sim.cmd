@echo off
REM Launcher for the simulator dev server, called by run-both-detached.cmd.
REM It exists as its own file on purpose: `start "" cmd /c "cd /d ""..."" && ..."
REM with a path containing spaces silently failed to run at all here - no
REM process, no port, not even a log file to explain itself. A launcher file
REM needs no nested quoting, so there is nothing left to get wrong.
setlocal
cd /d "%~dp0..\apps\simulator"
call npm run dev
endlocal
