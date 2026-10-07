import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const publicRoot = new URL('../../public/', import.meta.url)
const generatedIndex = new URL('legacy-assets/index.html', publicRoot)
const html = await readFile(generatedIndex, 'utf8')
const routes = { hm: 'HM', about: 'About', projects: 'Projects', links: 'Links' }

for (const [route, title] of Object.entries(routes)) {
  const directory = new URL(`${route}/`, publicRoot)
  await mkdir(directory, { recursive: true })
  const page = html.replace('<title>162383.xyz</title>', `<title>${title} — 162383.xyz</title>`)
  await writeFile(new URL('index.html', directory), page)
}

await unlink(generatedIndex)
console.log(`Prepared route pages: ${Object.keys(routes).join(', ')} in ${fileURLToPath(publicRoot)}`)
