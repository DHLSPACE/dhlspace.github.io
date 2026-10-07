param([ValidateSet('start','check','schedule','remove')][string]$Mode='start')
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$graduatePython=$null
$graduatePyCommand=Get-Command py.exe -ErrorAction SilentlyContinue
if($graduatePyCommand){
    $graduateCandidate=& $graduatePyCommand.Source -3 -c 'import sys; print(sys.executable)' 2>$null
    if($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $graduateCandidate)){$graduatePython=$graduateCandidate}
}
if(-not $graduatePython){
    $graduatePyCommand=Get-Command python.exe -ErrorAction SilentlyContinue
    if($graduatePyCommand){$graduatePython=$graduatePyCommand.Source}
}
if(-not $graduatePython){throw 'Python not found. Install Python 3.10+ from https://www.python.org/downloads/windows/ and enable Add python.exe to PATH.'}
& $graduatePython -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required"'
if($LASTEXITCODE -ne 0){throw 'Python 3.10+ required.'}
$graduatePythonw=Join-Path (Split-Path -Parent $graduatePython) 'pythonw.exe'
if(-not (Test-Path -LiteralPath $graduatePythonw)){$graduatePythonw=$graduatePython}
$graduateApp=Join-Path $PSScriptRoot 'app.py'
$graduateTask='GraduateAdmissionsMonitor'
switch($Mode){
    'start' {
        $graduateLaunch=Join-Path $PSScriptRoot 'launch.pyw'
        Start-Process -FilePath $graduatePythonw -ArgumentList @('-B',('"'+$graduateLaunch+'"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    }
    'check' {
        & $graduatePython -B $graduateApp --check --force
        if($LASTEXITCODE -ne 0){throw 'Check failed. Read data/last_check.log.'}
        Write-Host 'Finished. Open the app to review source failures and pending archives.'
    }
    'schedule' {
        $graduateIdentity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $graduateAction=New-ScheduledTaskAction -Execute $graduatePythonw -Argument ('-B "'+$graduateApp+'" --check') -WorkingDirectory $PSScriptRoot
        $graduateTrigger=New-ScheduledTaskTrigger -Daily -At '09:00'
        $graduateSettings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
        $graduatePrincipal=New-ScheduledTaskPrincipal -UserId $graduateIdentity -LogonType Interactive -RunLevel Limited
        Register-ScheduledTask -TaskName $graduateTask -Action $graduateAction -Trigger $graduateTrigger -Settings $graduateSettings -Principal $graduatePrincipal -Description 'Local graduate admissions archive. Daily 09:00; requires signed-in Windows user and internet.' -Force | Out-Null
        Get-ScheduledTask -TaskName $graduateTask | Select-Object TaskName,State
        Write-Host 'Daily 09:00 check enabled. Your Windows account must be signed in. Powered-off PCs cannot collect data.'
    }
    'remove' {
        $graduateExisting=Get-ScheduledTask -TaskName $graduateTask -ErrorAction SilentlyContinue
        if($graduateExisting){Unregister-ScheduledTask -TaskName $graduateTask -Confirm:$false}
        Write-Host 'Daily check removed. Existing archives and notes are preserved.'
    }
}
