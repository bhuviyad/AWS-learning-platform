param(
  [string]$AccountId = '483591406604',
  [string]$Region = 'ap-south-1',
  [string]$BackendUserName = 'learning-platform-backend',
  [string]$SandboxRoleName = 'interns-sandbox-role',
  [string]$LambdaExecutionRoleName = 'interns-lambda-execution-role'
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..\..')
$iamRoot = Join-Path $repoRoot 'infra\aws\iam'
$policiesDir = Join-Path $iamRoot 'policies'
$rolesDir = Join-Path $iamRoot 'roles'

function Assert-AwsCli {
  if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'AWS CLI is not installed or not on PATH.'
  }
}

function Assert-AccountContext {
  $caller = aws sts get-caller-identity --output json | ConvertFrom-Json
  Write-Host "Using AWS account $($caller.Account) as $($caller.Arn)"
  if ($caller.Account -ne $AccountId) {
    Write-Host "Warning: target account is $AccountId but AWS CLI is authenticated to $($caller.Account)."
  }
}

function New-RenderedJsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $content = Get-Content -Path $Path -Raw
  $content = $content.Replace('ACCOUNT_ID', $AccountId).Replace('REGION', $Region)
  $tempFile = New-TemporaryFile
  Set-Content -Path $tempFile.FullName -Value $content -Encoding utf8
  return $tempFile.FullName
}

function Set-UserInlinePolicy {
  param(
    [Parameter(Mandatory = $true)][string]$UserName,
    [Parameter(Mandatory = $true)][string]$PolicyName,
    [Parameter(Mandatory = $true)][string]$PolicyFile
  )

  aws iam put-user-policy `
    --user-name $UserName `
    --policy-name $PolicyName `
    --policy-document file://$PolicyFile | Out-Null
}

function Set-RoleInlinePolicy {
  param(
    [Parameter(Mandatory = $true)][string]$RoleName,
    [Parameter(Mandatory = $true)][string]$PolicyName,
    [Parameter(Mandatory = $true)][string]$PolicyFile
  )

  aws iam put-role-policy `
    --role-name $RoleName `
    --policy-name $PolicyName `
    --policy-document file://$PolicyFile | Out-Null
}

function Ensure-Role {
  param(
    [Parameter(Mandatory = $true)][string]$RoleName,
    [Parameter(Mandatory = $true)][string]$TrustPolicyFile
  )

  $exists = $true
  try {
    aws iam get-role --role-name $RoleName --output json | Out-Null
  } catch {
    $exists = $false
  }

  if ($exists) {
    Write-Host "Updating trust policy for role: $RoleName"
    aws iam update-assume-role-policy `
      --role-name $RoleName `
      --policy-document file://$TrustPolicyFile | Out-Null
  } else {
    Write-Host "Creating role: $RoleName"
    aws iam create-role `
      --role-name $RoleName `
      --assume-role-policy-document file://$TrustPolicyFile | Out-Null
  }
}

function Attach-ManagedPolicy {
  param(
    [Parameter(Mandatory = $true)][string]$RoleName,
    [Parameter(Mandatory = $true)][string]$PolicyArn
  )

  aws iam attach-role-policy `
    --role-name $RoleName `
    --policy-arn $PolicyArn | Out-Null
}

Assert-AwsCli
Assert-AccountContext

$backendUserPolicyFile = New-RenderedJsonFile -Path (Join-Path $policiesDir 'learning-platform-backend-assume-sandbox-role.json')
$backendCleanupPolicyFile = New-RenderedJsonFile -Path (Join-Path $policiesDir 'learning-platform-backend-cleanup-resources.json')
$sandboxTrustFile = New-RenderedJsonFile -Path (Join-Path $rolesDir 'interns-sandbox-trust-policy.json')
$sandboxPolicyFile = New-RenderedJsonFile -Path (Join-Path $policiesDir 'interns-sandbox-permissions.json')
$lambdaTrustFile = New-RenderedJsonFile -Path (Join-Path $rolesDir 'interns-lambda-execution-trust-policy.json')

try {
  Write-Host 'Applying backend assume-role policy...'
  Set-UserInlinePolicy -UserName $BackendUserName -PolicyName 'LearningLabAssumeSandboxRole' -PolicyFile $backendUserPolicyFile

  Write-Host 'Applying backend cleanup policy...'
  Set-UserInlinePolicy -UserName $BackendUserName -PolicyName 'LearningLabCleanupResources' -PolicyFile $backendCleanupPolicyFile

  Write-Host 'Applying sandbox role trust policy...'
  Ensure-Role -RoleName $SandboxRoleName -TrustPolicyFile $sandboxTrustFile

  Write-Host 'Applying sandbox role permissions...'
  Set-RoleInlinePolicy -RoleName $SandboxRoleName -PolicyName 'LearningLabSandboxPermissions' -PolicyFile $sandboxPolicyFile

  Write-Host 'Applying Lambda execution role...'
  Ensure-Role -RoleName $LambdaExecutionRoleName -TrustPolicyFile $lambdaTrustFile
  Attach-ManagedPolicy -RoleName $LambdaExecutionRoleName -PolicyArn 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'

  Write-Host ''
  Write-Host 'AWS IAM infrastructure applied successfully.' -ForegroundColor Green
  Write-Host "Sandbox role: $SandboxRoleName"
  Write-Host "Lambda execution role: $LambdaExecutionRoleName"
  Write-Host "Backend user: $BackendUserName"
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $backendUserPolicyFile, $backendCleanupPolicyFile, $sandboxTrustFile, $sandboxPolicyFile, $lambdaTrustFile
}
