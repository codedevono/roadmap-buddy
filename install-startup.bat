@echo off
echo Setting up Roadmap Buddy to launch on Windows Startup...
set "TARGET=%~dp0silent-launch.vbs"
set "DEST=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\RoadmapBuddy.vbs"

copy /y "%TARGET%" "%DEST%" >nul

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Roadmap Buddy is now registered in your Windows Startup!
    echo It will start silently in the background and pop up your roadmap every time you boot your PC.
    echo.
) else (
    echo [ERROR] Could not copy to startup folder.
)
pause

