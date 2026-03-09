import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  GODCODE_E2E_SPACE_DIR_ENV,
  GODCODE_E2E_TEST_ENV,
  GODCODE_WORKSPACE_DIR,
  LEGACY_CODEALL_E2E_SPACE_DIR_ENV,
  LEGACY_CODEALL_E2E_TEST_ENV,
  LEGACY_CODEALL_WORKSPACE_DIR,
  readCompatibleEnvValue,
  isCompatibleEnvEnabled
} from '@/shared/brand-compat'

export function isGodCodeE2ETestEnvironment(): boolean {
  return isCompatibleEnvEnabled(process.env, GODCODE_E2E_TEST_ENV, LEGACY_CODEALL_E2E_TEST_ENV)
}

export function readGodCodeEnvValue(primaryName: string, legacyName: string): string | undefined {
  return readCompatibleEnvValue(process.env, primaryName, legacyName)
}

export function resolveGodCodeE2ESpaceDir(): string {
  return (
    readCompatibleEnvValue(
      process.env,
      GODCODE_E2E_SPACE_DIR_ENV,
      LEGACY_CODEALL_E2E_SPACE_DIR_ENV
    ) ?? path.join(os.tmpdir(), 'godcode-e2e-space')
  )
}

export function getCanonicalWorkspaceScopedDir(workDir: string, childDir: string): string {
  return path.join(workDir, GODCODE_WORKSPACE_DIR, childDir)
}

export function getLegacyWorkspaceScopedDir(workDir: string, childDir: string): string {
  return path.join(workDir, LEGACY_CODEALL_WORKSPACE_DIR, childDir)
}

export function resolveWorkspaceScopedDir(workDir: string, childDir: string): string {
  const canonicalDir = getCanonicalWorkspaceScopedDir(workDir, childDir)
  if (fs.existsSync(canonicalDir)) {
    return canonicalDir
  }

  const legacyDir = getLegacyWorkspaceScopedDir(workDir, childDir)
  if (fs.existsSync(legacyDir)) {
    return legacyDir
  }

  return canonicalDir
}

export function getCanonicalUserSkillsDir(homeDir: string): string {
  return path.join(homeDir, GODCODE_WORKSPACE_DIR, 'skills')
}

export function getLegacyUserSkillsDir(homeDir: string): string {
  return path.join(homeDir, LEGACY_CODEALL_WORKSPACE_DIR, 'skills')
}

export function resolveUserSkillsDir(homeDir: string): string {
  const canonicalDir = getCanonicalUserSkillsDir(homeDir)
  if (fs.existsSync(canonicalDir)) {
    return canonicalDir
  }

  const legacyDir = getLegacyUserSkillsDir(homeDir)
  if (fs.existsSync(legacyDir)) {
    return legacyDir
  }

  return canonicalDir
}
