@echo off
setlocal

rem Este arquivo precisa estar dentro da pasta do repositorio Git.
cd /d "%~dp0"

set /p MSG="Mensagem do commit: "
if "%MSG%"=="" set MSG=Atualizacao do app

echo.
echo Adicionando arquivos...
git add -A

echo Criando commit...
git commit -m "%MSG%"

echo Enviando para o GitHub (forcado)...
git push origin main --force

echo.
echo ===============================
echo Concluido.
echo ===============================
pause