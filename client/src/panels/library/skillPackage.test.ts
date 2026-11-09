// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { packageFromFileList } from './skillPackage'

const file = (webkitRelativePath: string) => ({ webkitRelativePath }) as File

describe('packageFromFileList', () => {
  it('strips the folder name from each path', () => {
    const skillPackage = packageFromFileList([file('demo/SKILL.md'), file('demo/scripts/run.sh')])
    expect(skillPackage.packageName).toBe('demo')
    expect(skillPackage.files.map((entry) => entry.path)).toEqual(['SKILL.md', 'scripts/run.sh'])
  })

  it('refuses a folder without SKILL.md', () => {
    expect(() => packageFromFileList([file('demo/readme.md')])).toThrow()
  })

  it('refuses several folders', () => {
    expect(() => packageFromFileList([file('a/SKILL.md'), file('b/SKILL.md')])).toThrow()
  })

  it('refuses an empty selection', () => expect(() => packageFromFileList([])).toThrow())
})
