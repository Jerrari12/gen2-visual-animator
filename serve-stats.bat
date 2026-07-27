@echo off
cd /d "%~dp0"
if not exist ".goatcounter-token" (
  echo.
  echo   No .goatcounter-token file found.
  echo   Create one next to this file containing just your GoatCounter API token.
  echo   Get it at: jerrari.goatcounter.com  -^>  User  -^>  API
  echo.
  pause
  exit /b 1
)
start "" http://localhost:8125/
python serve-stats.py %*
pause
