import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Settings } from 'lucide-react';
import EditProfileModal from './EditProfileModal';
import SettingsModal from './SettingsModal';
import UserListModal from '../../components/UserListModal';

export default function ProfileScreen() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [userListConfig, setUserListConfig] = useState<{ isOpen: boolean; type: 'followers' | 'following' }>({
    isOpen: false,
    type: 'followers'
  });

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

          <div className="flex items-center gap-8 py-2">
            <button 
              onClick={() => setUserListConfig({ isOpen: true, type: 'followers' })}
              className="flex flex-col items-center group"
            >
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-brand-500 transition-colors">
                {profile?.follower_count || 0}
              </span>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Followers</span>
            </button>
            <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-800" />
            <button 
              onClick={() => setUserListConfig({ isOpen: true, type: 'following' })}
              className="flex flex-col items-center group"
            >
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-brand-500 transition-colors">
                {profile?.following_count || 0}
              </span>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Following</span>
            </button>
          </div>

          {profile?.bio && (
            <p className="text-center text-zinc-600 mt-2 dark:text-zinc-300">{profile.bio}</p>
          )}
          <Button variant="outline" className="mt-4 w-full" onClick={() => setIsEditModalOpen(true)}>Edit Profile</Button>
        </div>
      </div>

      <EditProfileModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />
      <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
      
      {profile && (
        <UserListModal 
          isOpen={userListConfig.isOpen}
          type={userListConfig.type}
          userId={profile.id}
          onClose={() => setUserListConfig({ ...userListConfig, isOpen: false })}
          onUserClick={(uid) => navigate(`/user/${uid}`)}
        />
      )}
    </div>
  );
}
