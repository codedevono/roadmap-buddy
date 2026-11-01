@echo off
title Roadmap Buddy Daemon
cd /d "%~dp0"

:: Check if server is already running
curl -s http://localhost:8000/api/status >nul 2>&1
if %errorlevel% equ 0 (
    echo Roadmap Buddy is already running! Opening browser...
    start http://localhost:8000
    exit /b
)

echo Starting Roadmap Buddy Daemon...
start /b python server.py
timeout /t 2 /nobreak >nul

:: Open as standalone desktop app if Chrome or Edge exists, else default browser
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:8000
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:8000
) else (
    start http://localhost:8000
)

