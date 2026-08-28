import React, { useState, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, profile: currentUserProfile } = useAuthStore();
  const { conversations, fetchConversations } = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const searchUsers = () => {
      const allUsersStr = localStorage.getItem('gazzchat_all_users');
      const allUsers = allUsersStr ? JSON.parse(allUsersStr) : [];
      
      const filtered = allUsers.filter((u: any) => 
        u.id !== user?.uid && 
        (u.username.toLowerCase().includes(query.toLowerCase()) || 
         u.display_name.toLowerCase().includes(query.toLowerCase()))
      );
      setResults(filtered);
      setLoading(false);
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [query, user?.uid]);

  const startChat = async (targetUserId: string) => {
    if (!currentUserProfile) return;
    const isSelf = targetUserId === currentUserProfile.id;

    // Check if conversation already exists
    const existingConv = conversations.find(c => 
      c.type === 'direct' && (
        isSelf 
          ? c.members.length === 1 || (c.members.length === 2 && c.members[0].id === currentUserProfile.id && c.members[1].id === currentUserProfile.id)
          : c.members.some(m => m.id === targetUserId) && c.members.some(m => m.id !== currentUserProfile.id)
      )
    );

    if (existingConv) {
      onClose();
      navigate(`/chat/${existingConv.id}`);
      return;
    }

    // Mock create new conversation
    const newConvId = `mock-conv-${crypto.randomUUID()}`;
    let selectedUser = isSelf ? currentUserProfile : null;
    if (!selectedUser) {
      const allUsersStr = localStorage.getItem('gazzchat_all_users');
      const allUsers = allUsersStr ? JSON.parse(allUsersStr) : [];
      selectedUser = allUsers.find((u: any) => u.id === targetUserId);
    }
    
    if (!selectedUser) return;

    const newConversation = {
      id: newConvId,
      type: 'direct' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      members: isSelf ? [currentUserProfile] : [currentUserProfile, selectedUser]
    };
    
    useChatStore.getState().setConversations([newConversation, ...conversations]);
    
    onClose();
    navigate(`/chat/${newConvId}`);
  };

  if (!isOpen) return null;

  const showSelfOption = user && currentUserProfile && (
    !query.trim() || 
    'message yourself you notes'.includes(query.toLowerCase()) || 
    currentUserProfile.display_name.toLowerCase().includes(query.toLowerCase()) ||
    currentUserProfile.username.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <X size={24} />
        </button>
        <h2 className="text-lg font-semibold">New Chat</h2>
      </div>

      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name or @username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {showSelfOption && user && currentUserProfile && (
          <button
            onClick={() => startChat(user.uid)}
            className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors bg-brand-50/50 hover:bg-brand-50 border border-brand-100 dark:bg-brand-500/10 dark:hover:bg-brand-500/15 dark:border-brand-500/20"
          >
            <Avatar src={currentUserProfile.avatar_url} size="md" />
            <div className="flex flex-col flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">{currentUserProfile.display_name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500 text-white uppercase tracking-wider">You</span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Message yourself (Notes, links, media)</span>
            </div>
          </button>
        )}

        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-1">
            {results.map((profile) => (
              <button
                key={profile.id}
                onClick={() => startChat(profile.id)}
                className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-800/50"
              >
                <Avatar src={profile.avatar_url} size="md" />
                <div className="flex flex-col">
                  <span className="font-medium">{profile.display_name}</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">@{profile.username}</span>
                </div>
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          !showSelfOption && (
            <div className="p-8 text-center text-zinc-500">
              No users found matching "{query}"
            </div>
          )
        ) : (
          <div className="p-4 text-center text-xs text-zinc-400">
            Search for a user or message yourself to save notes
          </div>
        )}
      </div>
    </div>
  );
}
