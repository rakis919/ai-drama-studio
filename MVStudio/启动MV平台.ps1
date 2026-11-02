param([switch]$NoBrowser)
$ErrorActionPreference='Stop'
$mvPython='D:/AIPlatform/ShortVideoRuntime/python_embeded/python.exe'
$mvUrl='http://127.0.0.1:4175'
$mvLogs='D:/AIPlatform/GptWork/MVStudio-launch'
try {
 if(-not (Test-Path -LiteralPath $mvPython)){throw "找不到运行环境：$mvPython"}
 $mvServer=Join-Path $PSScriptRoot 'server.py'
 if(-not (Test-Path -LiteralPath $mvServer)){throw "找不到平台程序：$mvServer"}
 $mvReady=$false
 try {$health=Invoke-RestMethod ($mvUrl+'/api/health') -TimeoutSec 2; if($health.platform -eq 'MV Studio'){$mvReady=$true}else{throw '4175端口运行的不是MV平台'}}catch {if($_.Exception.Message -eq '4175端口运行的不是MV平台'){throw}}
 if(-not $mvReady){
  New-Item -ItemType Directory -Path $mvLogs -Force | Out-Null
  $mvStamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
  $mvOut=Join-Path $mvLogs ($mvStamp+'.log');$mvError=Join-Path $mvLogs ($mvStamp+'-error.log')
  $mvChild=Start-Process -FilePath $mvPython -ArgumentList ('"'+$mvServer+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $mvOut -RedirectStandardError $mvError -PassThru
  for($mvTry=0;$mvTry -lt 30;$mvTry++){
   try {$health=Invoke-RestMethod ($mvUrl+'/api/health') -TimeoutSec 1;if($health.platform -eq 'MV Studio'){$mvReady=$true;break}}catch{}
   if($mvChild.HasExited){$mvDetail=if(Test-Path -LiteralPath $mvError){Get-Content -LiteralPath $mvError -Raw}else{''};throw ('平台启动后退出。'+$mvDetail+' 日志：'+$mvError)}
   Start-Sleep -Milliseconds 500
  }
  if(-not $mvReady){throw ('平台启动超时，请查看日志：'+$mvError)}
 }
 Write-Host ('MV 平台已启动：'+$mvUrl) -ForegroundColor Green
 if(-not $NoBrowser){Start-Process $mvUrl}
} catch {
 Write-Host ('启动失败：'+$_.Exception.Message) -ForegroundColor Red
 exit 1
}