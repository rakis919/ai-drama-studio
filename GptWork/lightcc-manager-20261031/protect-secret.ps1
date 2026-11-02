$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$request=[Console]::In.ReadToEnd() | ConvertFrom-Json
$protection=[System.Security.Cryptography.DataProtectionScope]::CurrentUser
if($request.operation -eq 'protect'){
 $bytes=[Text.Encoding]::UTF8.GetBytes([string]$request.value)
 $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,$protection)
 [Console]::Out.Write([Convert]::ToBase64String($encrypted))
}elseif($request.operation -eq 'unprotect'){
 $bytes=[Convert]::FromBase64String([string]$request.value)
 $plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,$protection)
 [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))
}else{throw 'Unsupported operation'}
