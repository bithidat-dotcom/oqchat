import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { MessageSquare, Phone, User } from 'lucide-react';
import { cn } from '../lib/utils';

// Lazy load main views
const ChatsListScreen = React.lazy(() => import('./main/ChatsListScreen'));
const CallsListScreen = React.lazy(() => import('./main/CallsListScreen'));
const ProfileScreen = React.lazy(() => import('./main/ProfileScreen'));

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { name: 'Chats', path: '/', icon: MessageSquare },
    { name: 'Calls', path: '/calls', icon: Phone },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-950">
      <div className="flex-1 overflow-hidden">
        <React.Suspense fallback={
          <div className="h-full w-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        }>
          <Routes>
            <Route path="/" element={<ChatsListScreen />} />
            <Route path="/calls" element={<CallsListScreen />} />
            <Route path="/profile" element={<ProfileScreen />} />
          </Routes>
        </React.Suspense>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-zinc-200 bg-white/80 backdrop-blur-md pb-safe dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="flex h-16 items-center justify-around px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;
            
            return (
              <button
                key={tab.name}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors",
                  isActive ? "text-brand-500" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center p-1 rounded-full transition-all duration-300",
                  isActive && "bg-brand-50 dark:bg-brand-500/10"
                )}>
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="text-[10px] font-medium">{tab.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
