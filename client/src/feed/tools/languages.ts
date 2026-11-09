const extensionToLanguage: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  toml: 'toml',
  ini: 'ini',
  conf: 'ini',
  dockerfile: 'docker',
  makefile: 'makefile',
  cmake: 'cmake',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
}

/** The Shiki language for a file, or 'text' when unknown. */
export function languageFromPath(filePath: string | undefined): string {
  if (!filePath) return 'text'
  const fileName = filePath.split(/[\\/]/).pop()!.toLowerCase()
  if (fileName === 'dockerfile') return 'docker'
  if (fileName === 'makefile') return 'makefile'
  if (fileName === 'cmakelists.txt') return 'cmake'
  const extension = fileName.includes('.') ? fileName.split('.').pop()! : ''
  return extensionToLanguage[extension] ?? 'text'
}
