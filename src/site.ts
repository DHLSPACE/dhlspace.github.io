export type NavigationItem = {
  label: string
  href: string
  external?: boolean
  document?: boolean
}

export type HomeAction = NavigationItem & {
  tone: 'solid' | 'outline'
}

export const NAV_ITEMS: NavigationItem[] = [
  { label: 'About', href: '/about' },
  { label: 'Projects', href: '/projects' },
  { label: 'Links', href: '/links' },
  { label: 'Lab', href: 'https://lab.162383.xyz', external: true },
  { label: 'Blog', href: 'https://blog.162383.xyz', external: true },
  { label: 'HM', href: '/hm' },
  { label: 'Invitation', href: '/date-invite/', document: true },
]

export const HOME_ACTIONS: HomeAction[] = [
  { label: 'View projects', href: '/projects', tone: 'solid' },
  { label: 'About this space', href: '/about', tone: 'solid' },
  { label: 'Browse links', href: '/links', tone: 'solid' },
  { label: 'Enter HM', href: '/hm', tone: 'solid' },
  { label: 'Open invitation', href: '/date-invite/', document: true, tone: 'outline' },
  { label: 'Visit the lab', href: 'https://lab.162383.xyz', external: true, tone: 'solid' },
  { label: 'Read the blog', href: 'https://blog.162383.xyz', external: true, tone: 'outline' },
]

export const GITHUB_URL = 'https://github.com/DHLSPACE'
