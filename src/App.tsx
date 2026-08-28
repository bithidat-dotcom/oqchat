/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { ProtectedRoute } from './components/ProtectedRoute';
import CallModal from './components/CallModal';

// Lazy load screens
const AuthScreen = React.lazy(() => import('./screens/AuthScreen'));
const ProfileSetupScreen = React.lazy(() => import('./screens/ProfileSetupScreen'));
const MainLayout = React.lazy(() => import('./screens/MainLayout'));
const ChatScreen = React.lazy(() => import('./screens/ChatScreen'));

export default function App() {
  const { initialize, initialized } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!initialized) {
    return null; // or a splash screen
  }

  return (
    <BrowserRouter>
      <div className="h-[100dvh] w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        <React.Suspense fallback={
          <div className="h-full w-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        }>
          <Routes>
            <Route path="/auth" element={<AuthScreen />} />
            <Route path="/setup-profile" element={<ProtectedRoute><ProfileSetupScreen /></ProtectedRoute>} />
            <Route path="/*" element={<ProtectedRoute><MainLayout /></ProtectedRoute>} />
            <Route path="/chat/:id" element={<ProtectedRoute><ChatScreen /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
        <CallModal />
      </div>
      <Toaster position="top-center" />
    </BrowserRouter>
  );
}
