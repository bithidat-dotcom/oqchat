/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { MessageSquare } from 'lucide-react';
import { useAuthStore } from './store/authStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import CallModal from './components/CallModal';

// Lazy load screens
const AuthScreen = React.lazy(() => import('./screens/AuthScreen'));
const ProfileSetupScreen = React.lazy(() => import('./screens/ProfileSetupScreen'));
const MainLayout = React.lazy(() => import('./screens/MainLayout'));
const ChatScreen = React.lazy(() => import('./screens/ChatScreen'));
const UserProfileScreen = React.lazy(() => import('./screens/main/UserProfileScreen'));

function SplashLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-white animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-4">
        {/* Animated Brand Badge & Logo */}
        <div className="relative group">
          <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-center overflow-hidden shadow-2xl shadow-[#88FF00]/30">
            <img 
              src="/favicon.jpg" 
              alt="oqchat logo" 
              className="w-full h-full object-cover"
            />
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#88FF00] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-[#88FF00] border-2 border-zinc-950"></span>
          </span>
        </div>

        {/* Brand Name Title */}
        <div className="flex items-center gap-1 mt-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            oq<span className="text-[#88FF00]">chat</span>
          </h1>
        </div>
        
        {/* Animated Dot Loader */}
        <div className="flex items-center gap-2.5 mt-2">
          <span className="w-3.5 h-3.5 bg-[#88FF00] rounded-full animate-dot-jump shadow-[0_0_10px_#88FF00]" style={{ animationDelay: '0ms' }} />
          <span className="w-3.5 h-3.5 bg-[#88FF00] rounded-full animate-dot-jump shadow-[0_0_10px_#88FF00]" style={{ animationDelay: '150ms' }} />
          <span className="w-3.5 h-3.5 bg-[#88FF00] rounded-full animate-dot-jump shadow-[0_0_10px_#88FF00]" style={{ animationDelay: '300ms' }} />
        </div>

        <span className="text-[11px] tracking-widest uppercase font-semibold text-zinc-400 mt-1">
          Starting...
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const { initialize, initialized } = useAuthStore();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    initialize();
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [initialize]);

  if (!initialized || showSplash) {
    return <SplashLoader />;
  }

  return (
    <BrowserRouter>
      <div className="h-[100dvh] w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        <React.Suspense fallback={<SplashLoader />}>
          <Routes>
            <Route path="/auth" element={<AuthScreen />} />
            <Route path="/setup-profile" element={<ProtectedRoute><ProfileSetupScreen /></ProtectedRoute>} />
            <Route path="/*" element={<ProtectedRoute><MainLayout /></ProtectedRoute>} />
            <Route path="/chat/:id" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
            <Route path="/user/:userId" element={<ProtectedRoute><UserProfileScreen /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
        <CallModal />
      </div>
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}
