@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0boot.ps1" -Mode remove
pause
