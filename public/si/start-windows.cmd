@echo off
cd /d "%~dp0..\.."
node public\si\probe.mjs --publish
pause
