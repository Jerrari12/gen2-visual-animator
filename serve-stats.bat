@echo off
cd /d "%~dp0"
python serve-stats.py %*
pause
