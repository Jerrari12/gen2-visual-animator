@echo off
rem GEN2 viewer dev server — double-click to serve viewer/ on http://localhost:8123
rem (the planner's local "3D assembly instructions" button points here).
rem Uses serve-viewer.py: caching disabled, so JS edits ALWAYS load fresh.
rem If it exits instantly, port 8123 is already served (e.g. by a Claude session).
cd /d "%~dp0"
python serve-viewer.py
