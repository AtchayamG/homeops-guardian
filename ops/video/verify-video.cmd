@echo off
REM Independent verification of the assembled demo video. Checks the things a
REM judge would notice and an assembler cannot promise: real streams, audio
REM that is actually present and not clipped, no dead air, no black stretch,
REM and a contact sheet so the footage gets looked at rather than trusted.
setlocal
set "V=%~dp0..\..\docs\06-demo-submission\homeops-demo.mp4"
if not exist "%V%" (
    echo NOT FOUND: %V%
    echo Run: node ops/video/assemble.mjs
    exit /b 1
)

echo === streams ===
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels -of default=noprint_wrappers=1 "%V%"

echo.
echo === loudness ===
ffmpeg -hide_banner -nostats -i "%V%" -af volumedetect -f null NUL 2>&1 | findstr /c:"mean_volume" /c:"max_volume"

echo.
echo === silence longer than 4s ===
ffmpeg -hide_banner -nostats -i "%V%" -af silencedetect=n=-45dB:d=4 -f null NUL 2>&1 | findstr /c:"silence_start" /c:"silence_duration"
echo    (nothing above = no dead air over 4s)

echo.
echo === picture luma every 8s, is any stretch black ===
ffmpeg -hide_banner -nostats -i "%V%" -vf "fps=1/8,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null NUL 2>&1 | findstr /c:"YAVG"

echo.
echo === 30-tile contact sheet ===
ffmpeg -y -hide_banner -loglevel error -i "%V%" -vf "fps=30/163,scale=320:-1,tile=6x5" -frames:v 1 "%~dp0contact.png"
echo wrote %~dp0contact.png
endlocal
