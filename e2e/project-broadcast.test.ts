/**
 * Cross-window project list freshness
 *
 * A project created, renamed or deleted from another window (or the REST API)
 * must reach every connected client as the full project.list, so no client
 * keeps a stale list until a reload.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestServer, createTestClient, createProject, type TestServerHandle } from './utils/index.js'

type ProjectList = { projects: Array<{ id: string; name: string }> }

describe('project.list broadcast', () => {
  let server: TestServerHandle

  beforeAll(async () => {
    server = await createTestServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('sends the full list to other clients on create, rename and delete', async () => {
    const client = await createTestClient({ url: server.wsUrl })
    try {
      const project = await createProject(server.url, { name: 'list-broadcast', workdir: '/tmp/list-broadcast' })
      await client.waitFor(
        'project.list',
        (payload) => (payload as ProjectList).projects.some((p) => p.id === project.id),
        5_000,
      )

      await fetch(`${server.url}/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'renamed' }),
      })
      await client.waitFor(
        'project.list',
        (payload) => (payload as ProjectList).projects.some((p) => p.id === project.id && p.name === 'renamed'),
        5_000,
      )

      await fetch(`${server.url}/api/projects/${project.id}`, { method: 'DELETE' })
      const afterDelete = await client.waitFor(
        'project.list',
        (payload) => !(payload as ProjectList).projects.some((p) => p.id === project.id),
        5_000,
      )
      expect(afterDelete).toBeTruthy()
    } finally {
      await client.close()
    }
  })
})
