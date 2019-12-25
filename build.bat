@echo off

if "%1" == "-r" goto RELEASE
if "%1" == "--release" goto RELEASE

if "%1" == "" goto DEVELOPMENT
if "%1" == "-d" goto DEVELOPMENT
if "%1" == "--debug" goto DEVELOPMENT

:RELEASE:
    npx webpack --config webpack.config.js --mode "production"

:DEVELOPMENT:
    npx webpack --config webpack.config.js --mode "development"
