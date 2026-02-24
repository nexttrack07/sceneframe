import { Link } from '@tanstack/react-router'
import { UserButton } from '@clerk/tanstack-react-start'
import { Film } from 'lucide-react'

export default function AppNav() {
  return (
    <header className="h-14 border-b bg-white flex items-center px-6 gap-6 shrink-0">
      <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-gray-900">
        <Film size={20} className="text-blue-600" />
        <span>SceneFrame</span>
      </Link>

      <nav className="flex items-center gap-1 flex-1">
        <Link
          to="/dashboard"
          className="text-sm px-3 py-1.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          activeProps={{ className: 'text-sm px-3 py-1.5 rounded-md text-gray-900 bg-gray-100 font-medium' }}
        >
          Projects
        </Link>
      </nav>

      <UserButton />
    </header>
  )
}
