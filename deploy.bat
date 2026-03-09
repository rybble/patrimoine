@echo off
echo.
echo ========================================
echo   DEPLOIEMENT PATRIMOINE
echo ========================================
echo.

cd /d C:\Users\rybbl\patrimoine

echo [0/5] Nettoyage du build precedent...
if exist dist rmdir /s /q dist

echo [1/5] Compilation...
call npm run build
if errorlevel 1 ( echo ERREUR lors du build & pause & exit /b 1 )

echo [2/5] Preparation des fichiers...
call git add .

echo [3/5] Sauvegarde locale...
call git commit -m "mise a jour %date% %time%"

echo [4/5] Envoi sur GitHub...
call git push
if errorlevel 1 ( echo ERREUR lors du push & pause & exit /b 1 )

echo [5/5] Publication du site...
call gh-pages -d dist
if errorlevel 1 ( echo ERREUR lors du deploiement & pause & exit /b 1 )

echo.
echo ========================================
echo   SITE MIS A JOUR AVEC SUCCES !
echo   https://rybble.github.io/patrimoine/
echo ========================================
echo.
pause
