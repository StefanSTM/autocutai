@echo off
setlocal

title ZaKo AutoCut Worker

echo ================================================
echo   ZaKo AutoCut - Worker Launcher
echo ================================================
echo.

set "ROOT=%~dp0"

REM This .bat works if placed either:
REM 1) inside autocut-ai-premiere-2026\ next to the worker folder
REM 2) directly inside the worker\ folder

if exist "%ROOT%worker\package.json" (
    set "WORKER=%ROOT%worker"
) else if exist "%ROOT%package.json" (
    set "WORKER=%ROOT%"
) else (
    echo ERROR: Could not find worker\package.json or package.json.
    echo Put this file in the main autocut-ai-premiere-2026 folder next to worker\.
    echo.
    pause
    exit /b 1
)

echo Worker folder:
echo %WORKER%
echo.

cd /d "%WORKER%"
if errorlevel 1 (
    echo ERROR: Could not open the worker folder.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not added to PATH.
    echo Install Node.js 18+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm is not installed or not added to PATH.
    echo Reinstall Node.js and make sure npm is included.
    echo.
    pause
    exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo WARNING: FFmpeg was not found in PATH.
    echo AutoCut silence detection needs FFmpeg.
    echo You can start the worker, but AutoCut may fail until FFmpeg is installed.
    echo.
) else (
    echo FFmpeg found.
)

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo Created .env from .env.example
    ) else (
        echo WARNING: .env.example was not found. Creating a basic .env file.
        > ".env" echo FFMPEG_PATH=ffmpeg
        >> ".env" echo PORT=3977
    )
    echo.
)

if not exist "node_modules" (
    echo Installing worker dependencies...
    echo This only happens the first time.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed.
        echo Check your internet connection and try again.
        echo.
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed.
)

echo.
echo Starting AutoCut worker...
echo Keep this window open while using silence AutoCut.
echo Worker URL: http://127.0.0.1:3977
echo Simple AutoCut only: FFmpeg silence analysis.
echo.

call npm run dev

echo.
echo Worker stopped.
echo.
pause
