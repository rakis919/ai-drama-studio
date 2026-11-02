$ErrorActionPreference='Stop'
Write-Host '云端连接：如提示密码，请在此窗口输入。连接期间请保持窗口打开。'
& "$env:SystemRoot\System32\OpenSSH\ssh.exe" -N -p 50278 -L '127.0.0.1:18190:127.0.0.1:7860' -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new -o 'UserKnownHostsFile=D:/AIPlatform/GptWork/platform-cloud-20261031/known_hosts' -o ServerAliveInterval=30 -o ServerAliveCountMax=3 'root@YOUR-INSTANCE.lightcc.cloud'
