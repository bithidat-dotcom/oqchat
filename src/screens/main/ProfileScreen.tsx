import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Settings } from 'lucide-react';
import EditProfileModal from './EditProfileModal';
import SettingsModal from './SettingsModal';

export default function ProfileScreen() {
  const { profile } = useAuthStore();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  return (
    <div className="flex h-full flex-col relative">
      <div className="px-4 pt-6 pb-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
          >
            <Settings size={20} />
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        </div>
        {profile && (
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
            {profile.display_name}
          </span>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
        {/* Profile section */}
        <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          <Avatar src={profile?.avatar_url} size="xl" />
          <div className="flex flex-col items-center overflow-hidden">
            <h2 className="text-2xl font-bold truncate">{profile?.display_name || 'Anonymous'}</h2>
            <p className="text-zinc-500 text-sm truncate dark:text-zinc-400">@{profile?.username || 'user'}</p>
          </div>
          {profile?.bio && (
            <p className="text-center text-zinc-600 mt-2 dark:text-zinc-300">{profile.bio}</p>
          )}
          <Button variant="outline" className="mt-4 w-full" onClick={() => setIsEditModalOpen(true)}>Edit Profile</Button>
        </div>
      </div>

      <EditProfileModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
    </div>
  );
}
