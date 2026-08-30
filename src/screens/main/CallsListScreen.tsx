import React, { useState, useEffect } from 'react';
import { Phone, Video, Search, UserCheck, Clock, ShieldCheck, Trash2, ArrowUpRight, ArrowDownLeft, X } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'profiles' | 'history'>('history');

  // Call History State
  const [callLogs, setCallLogs] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('oqchat_call_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { id: 'c1', name: 'Demo Call', type: 'video', direction: 'outgoing', time: new Date(Date.now() - 3600000).toISOString(), duration: '2m 14s' }
    ];
  });

  const saveLogs = (logs: any[]) => {
    setCallLogs(logs);
    localStorage.setItem('oqchat_call_history', JSON.stringify(logs));
  };

  const deleteCallLog = (id: string) => {
    const updated = callLogs.filter(log => log.id !== id);
    saveLogs(updated);
    toast.success('Call log deleted');
  };

  const clearAllCallLogs = () => {
    saveLogs([]);
    toast.success('Call history cleared');
  };

  // Get all user profiles (from saved conversations + self + all_users)
  const allUsersStr = localStorage.getItem('oqchat_all_users');
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

  const filteredLogs = callLogs.filter(log =>
    log.name?.toLowerCase().includes(search.toLowerCase()) ||
    log.type?.toLowerCase().includes(search.toLowerCase())
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

    // Append to call logs
    const newLog = {
      id: `log-${Date.now()}`,
      name: targetUser.display_name || 'User',
      avatar: targetUser.avatar_url,
      type,
      direction: 'outgoing',
      time: new Date().toISOString(),
      duration: 'Ongoing'
    };
    saveLogs([newLog, ...callLogs]);

    toast.success(`Starting ${type} call with ${targetUser.display_name}`);
  };

  return (
    <div className="flex h-full flex-col relative">
      {/* Header */}
      <div className="px-4 pt-[10px] pb-2">
        <div className="flex items-center justify-between mb-3">
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

        {/* Tab Selector: Call History vs Available Profiles */}
        <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl mb-3">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === 'history'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Call History ({callLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('profiles')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all ${
              activeTab === 'profiles'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Start New Call ({filteredProfiles.length})
          </button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder={activeTab === 'history' ? "Search call history..." : "Search profiles to call..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 no-scrollbar space-y-2">
        {activeTab === 'history' ? (
          /* Call History View */
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Recent Call Logs
              </span>
              {callLogs.length > 0 && (
                <button
                  onClick={clearAllCallLogs}
                  className="text-xs text-red-500 hover:underline font-semibold flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  Clear All History
                </button>
              )}
            </div>

            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900 transition-all hover:border-brand-200 dark:hover:border-brand-500/30"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <Avatar src={log.avatar} size="lg" />
                    <div className="flex flex-col truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {log.name}
                        </span>
                        {log.direction === 'outgoing' ? (
                          <ArrowUpRight size={14} className="text-brand-500 shrink-0" />
                        ) : (
                          <ArrowDownLeft size={14} className="text-blue-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                        <span className="capitalize">{log.type} call</span>
                        <span>•</span>
                        <span>{new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Delete Call Log Button */}
                  <button
                    onClick={() => deleteCallLog(log.id)}
                    title="Delete call log"
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-zinc-400 text-sm">
                No call history logs found.
              </div>
            )}
          </div>
        ) : (
          /* Available Profiles View */
          <div className="space-y-2">
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
                    <button
                      onClick={() => startCall(p, 'voice')}
                      title="Voice Call"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 hover:bg-brand-500 hover:text-white dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500 dark:hover:text-white transition-all shadow-sm active:scale-95"
                    >
                      <Phone size={18} />
                    </button>

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
        )}
      </div>
    </div>
  );
}
