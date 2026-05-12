@echo off
echo ========================================
echo  DEPLOIEMENT REGLES FIRESTORE
echo ========================================
echo.

cd /d C:\Users\rybbl\patrimoine

echo [1/3] Connexion Firebase...
call firebase login --reauth

echo.
echo [2/3] Selection du projet...
call firebase use patrimoine-f2e19

echo.
echo [3/3] Deploiement des regles...
call firebase deploy --only firestore:rules
if errorlevel 1 ( echo ERREUR lors du deploiement des regles & pause & exit /b 1 )

echo.
echo ========================================
echo  REGLES FIRESTORE DEPLOYEES !
echo  Chaque utilisateur ne peut acceder
echo  qu'a ses propres donnees.
echo ========================================
echo.
pause
