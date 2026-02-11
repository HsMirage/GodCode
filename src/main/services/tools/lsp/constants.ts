/**
 * LSP Constants - Symbol kinds, severity levels, built-in servers
 */

import type { LSPServerConfig } from './types'

export const SYMBOL_KIND_MAP: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter'
}

export const SEVERITY_MAP: Record<number, string> = {
  1: 'error',
  2: 'warning',
  3: 'information',
  4: 'hint'
}

export const DEFAULT_MAX_REFERENCES = 200
export const DEFAULT_MAX_SYMBOLS = 200
export const DEFAULT_MAX_DIAGNOSTICS = 200

export const LSP_INSTALL_HINTS: Record<string, string> = {
  typescript: 'npm install -g typescript-language-server typescript',
  deno: 'Install Deno from https://deno.land',
  vue: 'npm install -g @vue/language-server',
  eslint: 'npm install -g vscode-langservers-extracted',
  gopls: 'go install golang.org/x/tools/gopls@latest',
  basedpyright: 'pip install basedpyright',
  pyright: 'pip install pyright',
  ruff: 'pip install ruff',
  rust: 'rustup component add rust-analyzer',
  clangd: 'See https://clangd.llvm.org/installation',
  svelte: 'npm install -g svelte-language-server',
  'bash-ls': 'npm install -g bash-language-server',
  'yaml-ls': 'npm install -g yaml-language-server',
  'lua-ls': 'See https://github.com/LuaLS/lua-language-server',
  php: 'npm install -g intelephense'
}

export const BUILTIN_SERVERS: Record<string, Omit<LSPServerConfig, 'id'>> = {
  typescript: {
    command: ['typescript-language-server', '--stdio'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
  },
  vue: {
    command: ['vue-language-server', '--stdio'],
    extensions: ['.vue']
  },
  gopls: {
    command: ['gopls'],
    extensions: ['.go']
  },
  basedpyright: {
    command: ['basedpyright-langserver', '--stdio'],
    extensions: ['.py', '.pyi']
  },
  pyright: {
    command: ['pyright-langserver', '--stdio'],
    extensions: ['.py', '.pyi']
  },
  ruff: {
    command: ['ruff', 'server'],
    extensions: ['.py', '.pyi']
  },
  rust: {
    command: ['rust-analyzer'],
    extensions: ['.rs']
  },
  clangd: {
    command: ['clangd', '--background-index', '--clang-tidy'],
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh', '.hxx', '.h++']
  },
  svelte: {
    command: ['svelteserver', '--stdio'],
    extensions: ['.svelte']
  },
  bash: {
    command: ['bash-language-server', 'start'],
    extensions: ['.sh', '.bash', '.zsh', '.ksh']
  },
  'yaml-ls': {
    command: ['yaml-language-server', '--stdio'],
    extensions: ['.yaml', '.yml']
  },
  'lua-ls': {
    command: ['lua-language-server'],
    extensions: ['.lua']
  },
  php: {
    command: ['intelephense', '--stdio'],
    extensions: ['.php']
  },
  java: {
    command: ['jdtls'],
    extensions: ['.java']
  }
}

export const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.vue': 'vue',
  '.go': 'go',
  '.py': 'python',
  '.pyi': 'python',
  '.rs': 'rust',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.svelte': 'svelte',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.zsh': 'shellscript',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.lua': 'lua',
  '.php': 'php',
  '.java': 'java',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.md': 'markdown'
}
