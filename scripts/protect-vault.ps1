param([ValidateSet('protect', 'unprotect')][string]$Mode)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Security
try {
    $inputValue = [Console]::In.ReadToEnd()
    $entropy = [Text.Encoding]::UTF8.GetBytes('Clever Read model vault v1')
    $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
    if ($Mode -eq 'protect') {
        $bytes = [Text.Encoding]::UTF8.GetBytes($inputValue)
        $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)
        [Console]::Out.Write([Convert]::ToBase64String($result))
    } else {
        $bytes = [Convert]::FromBase64String($inputValue.Trim())
        $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, $scope)
        [Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))
    }
} catch {
    [Console]::Error.Write('The model vault cannot be protected or opened by this Windows account.')
    exit 1
}
