@echo off
REM Starts the local database, the API and the dashboard.
REM The page MUST be served over http - opening index.html from
REM disk fails, because a module script cannot load from file://.

echo Starting database and API containers...
docker start vehicle-analytics-db vehicle-analytics-api >nul 2>&1

echo Waiting for the API...
:wait
curl -s -o nul http://localhost:3003/ || (timeout /t 1 >nul & goto wait)

echo.
echo   Dashboard: http://localhost:4173
echo   API:       http://localhost:3003
echo.
echo Press Ctrl+C to stop the server.
echo.

start "" http://localhost:4173
npx --yes serve -l 4173 "%~dp0"
