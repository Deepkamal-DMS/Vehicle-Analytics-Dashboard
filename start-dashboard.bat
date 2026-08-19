@echo off
REM Serves the dashboard. Data comes from Supabase, so nothing
REM local has to be running - no database, no API container.
REM The page MUST be served over http - opening index.html from
REM disk fails, because a module script cannot load from file://.

echo.
echo   Dashboard: http://localhost:4173
echo   API:       https://ytgoonducepylslknkag.supabase.co/rest/v1
echo.
echo Press Ctrl+C to stop the server.
echo.

start "" http://localhost:4173
npx --yes serve -l 4173 "%~dp0"
