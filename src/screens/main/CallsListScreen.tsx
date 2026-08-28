import React, { useState } from 'react';
import { Phone, Video, Search, UserCheck, Clock, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useCallStore } from '../../store/callStore';
import { Avatar } from '../../components/ui/Avatar';
import toast from 'react-hot-toast';

export default function CallsListScreen() {
  const { user, profile: currentUserProfile, onlineUsers } = useAuthStore();
  const { conversations } = useChatStore();
  const { setCalling, setActiveCall } = useCallStore();
  const [search, setSearch] = useState('');

  // Get all user profiles (from saved conversations + self + all_users)
  const allUsersStr = localStorage.getItem('gazzchat_all_users');
  const allGlobalUsers = allUsersStr ? JSON.parse(allUsersStr) : [];

  // Build a distinct list of profiles to call
  const profileList: any[] = [];
  
  // 1. Always include self
  if (currentUserProfile) {
    profileList.push({
      ...currentUserProfile,
      isSelf: true
    });
  }

  // 2. Add members from conversations or global users
  const addedIds = new Set<string>([currentUserProfile?.id || '']);

  conversations.forEach(c => {
    c.members.forEach(m => {
      if (m && !addedIds.has(m.id)) {
        addedIds.add(m.id);
        profileList.push({ ...m, isSelf: false });
      }
    });
  });

  allGlobalUsers.forEach((u: any) => {
    if (u && !addedIds.has(u.id)) {
      addedIds.add(u.id);
      profileList.push({ ...u, isSelf: false });
    }
  });

  const filteredProfiles = profileList.filter(p => 
    p.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.username?.toLowerCase().includes(search.toLowerCase()) ||
    (p.isSelf && 'you message yourself call'.includes(search.toLowerCase()))
  );

  const startCall = (targetUser: any, type: 'voice' | 'video') => {
    if (!user) return;
    setCalling(true);
    setActiveCall({
      id: `call-${Date.now()}`,
      caller: user.uid,
      receiver: targetUser.id,
      receiverProfile: targetUser,
      type,
      status: 'initiating'
    });
    toast.success(`Starting ${type} call with ${targetUser.display_name}`);
  };

  return (
    <div className="flex h-full flex-col relative">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
              <Phone size={18} strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Calls</h1>
          </div>
          {currentUserProfile && (
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {currentUserProfile.display_name}
            </span>
          )}
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search profiles to call..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
      </div>

      {/* Profile Call Cards List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 no-scrollbar space-y-2">
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Available Profiles ({filteredProfiles.length})
          </span>
          <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">
            HD Voice & Video
          </span>
        </div>

        {filteredProfiles.map((p) => {
          const isOnline = p.isSelf ? true : (!!onlineUsers[p.id] || p.is_online);

          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900 transition-all hover:border-brand-200 dark:hover:border-brand-500/30"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Avatar src={p.avatar_url} online={isOnline} size="lg" />
                <div className="flex flex-col truncate">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {p.display_name}
                    </span>
                    {p.isSelf && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 shrink-0">
                        You
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {p.isSelf ? 'Call yourself for preview & test' : (isOnline ? 'Online • Tap to call' : 'Offline')}
                  </span>
                </div>
              </div>

              {/* 2 Call Options (Voice & Video) */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Voice Call Option */}
                <button
                  onClick={() => startCall(p, 'voice')}
                  title="Voice Call"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-500 hover:text-white dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500 dark:hover:text-white transition-all shadow-sm active:scale-95"
                >
                  <Phone size={18} />
                </button>

                {/* Video Call Option */}
                <button
                  onClick={() => startCall(p, 'video')}
                  title="Video Call"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white transition-all shadow-sm active:scale-95"
                >
                  <Video size={19} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
