@echo off
echo ========================================
echo  Deploy Patrimoine PWA
echo ========================================

cd /d C:\Users\rybbl\patrimoine

echo.
echo [1/5] Installation des dependances PWA...
call npm install vite-plugin-pwa workbox-window --save-dev

echo.
echo [2/5] Copie des icones...
if not exist "public\icons" mkdir "public\icons"
copy /Y "%~dp0icons\icon-192.png" "public\icons\icon-192.png"
copy /Y "%~dp0icons\icon-512.png" "public\icons\icon-512.png"

echo.
echo [3/5] Copie de la config Vite PWA...
copy /Y "%~dp0vite.config.js" "vite.config.js"

echo.
echo [4/5] Build...
if exist dist rmdir /s /q dist
call npm run build

echo.
echo [5/5] Deploy sur GitHub Pages...
cd dist
git init
git add -A
git commit -m "PWA deploy"
git push -f https://github.com/rybble/patrimoine.git main:gh-pages

echo.
echo ========================================
echo  PWA deployee !
echo  Ouvre Chrome Android sur :
echo  https://rybble.github.io/patrimoine/
echo  puis : menu (3 points) > Ajouter a l ecran d accueil
echo ========================================
pause
