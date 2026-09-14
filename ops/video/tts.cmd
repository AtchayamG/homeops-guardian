@echo off
REM Regenerates the narration and then the manifest. Two steps because edge_tts
REM goes over the network and takes long enough that a single call can outlive a
REM tool timeout, leaving mp3s on disk with no manifest measuring them.
setlocal
cd /d "%~dp0..\.."
node ops\video\generate-tts.mjs > "%~dp0tts.log" 2>&1
node ops\video\measure-vo.mjs
endlocal
