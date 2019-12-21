@echo off
call :toOggTree
call :revorbTree
call :oggToWav
goto :eof




:toOggTree
rem Do whatever you want here over the files of this subdir, for example:
for %%f in (*.wem) do (
	%~dp0\ww2ogg\ww2ogg.exe %%f --pcb %~dp0\ww2ogg\packed_codebooks_aoTuV_603.bin
	del %%f
	)
for /D %%d in (*) do (
    cd %%d
    call :toOggTree
    cd ../
)
exit /b



:revorbTree
rem Do whatever you want here over the files of this subdir, for example:
for %%f in (*.ogg) do %~dp0\revorb\revorb.exe %%f 
for /D %%d in (*) do (
    cd %%d
    call :revorbTree
    cd ../
)
exit /b

:oggToWav
rem Do whatever you want here over the files of this subdir, for example:
for %%f in (*.ogg) do (
	%~dp0\ffmpeg\ffmpeg.exe -i %%f %%~nf.wav
	del %%f
)
for /D %%d in (*) do (
    cd %%d
    call :oggToWav
    cd ../
)
exit /b

