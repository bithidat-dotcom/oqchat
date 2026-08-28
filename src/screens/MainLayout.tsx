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
      <nav className="flex-shrink-0 border-t border-zinc-200/80 bg-white/90 backdrop-blur-md pb-safe dark:border-zinc-800/80 dark:bg-zinc-950/90 shadow-lg">
        <div className="flex h-16 items-center justify-around px-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = location.pathname === tab.path;
            
            return (
              <button
                key={tab.name}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-full space-y-0.5 transition-all duration-200 group active:scale-95",
                  isActive 
                    ? "text-zinc-900 dark:text-zinc-50 font-bold" 
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center p-2 rounded-2xl transition-all duration-300",
                  isActive 
                    ? "bg-gradient-to-tr from-[#88FF00] to-[#8EFE00] text-zinc-950 shadow-md shadow-[#88FF00]/30 scale-105" 
                    : "group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900"
                )}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="text-[10px] tracking-tight">{tab.name}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
