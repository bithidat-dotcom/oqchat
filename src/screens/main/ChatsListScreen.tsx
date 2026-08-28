import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore, Conversation } from '../../store/chatStore';
import { Avatar } from '../../components/ui/Avatar';
import { Search, Plus, MessageSquare, Trash2, AlertCircle, Ban, Mail, CheckCircle2, MoreVertical, X, Phone, Video } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../components/ui/Button';
import NewChatModal from './NewChatModal';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function ChatsListScreen() {
  const navigate = useNavigate();
  const { 
    conversations, 
    messages, 
    fetchConversations, 
    deleteConversation, 
    toggleUnread, 
    blockUser, 
    unblockUser,
    blockedUserIds, 
    loading 
  } = useChatStore();

  const { user, profile: currentUserProfile } = useAuthStore();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingConv, setDeletingConv] = useState<{ id: string; name: string } | null>(null);

  // Profile Context Menu Modal (on hold / long press)
  const [selectedConv, setSelectedConv] = useState<{ conv: Conversation; targetUser: any } | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  // Filter conversations where the current user is a member
  const myConversations = React.useMemo(() => {
    return conversations.filter(c => 
      c.members.some(m => m.id === user?.uid)
    );
  }, [conversations, user?.uid]);

  const filteredConversations = React.useMemo(() => {
    return myConversations.filter(c => {
      const isSelf = c.members.length === 1 || c.members.every(m => m.id === user?.uid);
      const otherMember = isSelf ? currentUserProfile : (c.members.find(m => m.id !== user?.uid) || c.members[0]);
      if (!otherMember) return false;
      if (!search.trim()) return true;
      return (
        otherMember.display_name.toLowerCase().includes(search.toLowerCase()) ||
        otherMember.username.toLowerCase().includes(search.toLowerCase()) ||
        (isSelf && 'you message yourself'.includes(search.toLowerCase()))
      );
    });
  }, [myConversations, currentUserProfile, user?.uid, search]);

  const [allUsers, setAllUsers] = useState<any[]>([]);

  useEffect(() => {
    // Fetch all users once (in a real app you might use Algolia or limit this)
    import('../../lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ collection, getDocs }) => {
        getDocs(collection(db, 'users')).then(snap => {
          const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAllUsers(users);
        });
      });
    });
  }, []);

  // Global profiles search (only when user types in search)
  const searchedGlobalUsers = React.useMemo(() => {
    if (!search.trim()) {
      return [];
    }

    // Find users not already in active conversations matching search query
    const existingUserIds = new Set(
      myConversations.flatMap(c => c.members.map(m => m.id))
    );

    return allUsers.filter((u: any) => 
      !existingUserIds.has(u.id) &&
      (u.username?.toLowerCase().includes(search.toLowerCase()) ||
       u.display_name?.toLowerCase().includes(search.toLowerCase()))
    );
  }, [search, myConversations, allUsers]);

  const startChatWithUser = async (targetUser: any) => {
    if (!currentUserProfile || !user) return;
    const isSelf = targetUser.id === currentUserProfile.id;

    const newConvId = `conv-${crypto.randomUUID()}`;
    const members = isSelf ? [currentUserProfile] : [currentUserProfile, targetUser];
    const memberIds = members.map(m => m.id);

    const { db } = await import('../../lib/firebase');
    const { doc, setDoc } = await import('firebase/firestore');

    await setDoc(doc(db, 'conversations', newConvId), {
      id: newConvId,
      type: 'direct',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      memberIds: memberIds
    });

    setSearch('');
    navigate(`/chat/${newConvId}`);
  };

  const confirmDeleteChat = () => {
    if (deletingConv) {
      deleteConversation(deletingConv.id);
      toast.success(`Chat deleted`);
      setDeletingConv(null);
    }
  };

  // Long-press hold handlers
  const handleHoldStart = (conv: Conversation, targetUser: any) => {
    holdTimerRef.current = setTimeout(() => {
      setSelectedConv({ conv, targetUser });
    }, 450);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  return (
    <div className="flex h-full flex-col relative">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
              <MessageSquare size={18} strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
          </div>
          <div className="flex items-center gap-3">
            {currentUserProfile && (
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {currentUserProfile.display_name}
              </span>
            )}
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
              title="New Chat"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search profiles or messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-zinc-800 dark:bg-zinc-900"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 no-scrollbar">
        {loading ? (
          <div className="flex justify-center p-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
          </div>
        ) : filteredConversations.length > 0 || searchedGlobalUsers.length > 0 ? (
          <div className="space-y-1">
            {/* Active Saved Chats */}
            {filteredConversations.map((conv) => {
              const isSelf = conv.members.length === 1 || conv.members.every(m => m.id === user?.uid);
              const otherMember = isSelf ? currentUserProfile : (conv.members.find(m => m.id !== user?.uid) || conv.members[0]);
              if (!otherMember) return null;
              
              const isBlocked = blockedUserIds.includes(otherMember.id);
              const chatMsgs = messages[conv.id] || [];
              const lastMsg = chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1] : null;
              const lastMsgText = isBlocked 
                ? '🚫 Profile blocked' 
                : lastMsg 
                  ? (lastMsg.message_type === 'image' ? '📷 Photo' : lastMsg.content) 
                  : (isSelf ? 'Message yourself' : 'Tap to view messages');
              
              const isUnread = !!conv.unreadCount;

              return (
                <div
                  key={conv.id}
                  onMouseDown={() => handleHoldStart(conv, otherMember)}
                  onMouseUp={handleHoldEnd}
                  onTouchStart={() => handleHoldStart(conv, otherMember)}
                  onTouchEnd={handleHoldEnd}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedConv({ conv, targetUser: otherMember });
                  }}
                  className="group relative flex w-full items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/50 select-none"
                >
                  <button
                    onClick={() => navigate(`/chat/${conv.id}`)}
                    className="flex flex-1 items-center gap-3 text-left overflow-hidden"
                  >
                    <Avatar src={otherMember.avatar_url} online={isSelf ? true : otherMember.is_online} size="lg" />
                    
                    <div className="flex flex-1 flex-col overflow-hidden text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-semibold truncate">{otherMember.display_name}</span>
                          {isSelf && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 shrink-0">
                              You
                            </span>
                          )}
                          {isBlocked && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 shrink-0">
                              Blocked
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-zinc-500 whitespace-nowrap ml-2">
                          {formatDistanceToNow(new Date(lastMsg ? lastMsg.created_at : conv.updated_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-sm text-zinc-500 truncate dark:text-zinc-400">
                          {lastMsgText}
                        </span>
                        {isUnread && (
                          <span className="h-2.5 w-2.5 rounded-full bg-brand-500 shrink-0 ml-2 animate-pulse" />
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Options Menu Trigger */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConv({ conv, targetUser: otherMember });
                    }}
                    title="Profile Options"
                    className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl transition-colors"
                  >
                    <MoreVertical size={18} />
                  </button>
                </div>
              );
            })}

            {/* Global Profiles Search Results */}
            {search.trim() && searchedGlobalUsers.length > 0 && (
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-2 mb-2 block">
                  Global Profiles Search
                </span>
                {searchedGlobalUsers.map((gUser) => (
                  <button
                    key={gUser.id}
                    onClick={() => startChatWithUser(gUser)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl p-2 transition-colors hover:bg-brand-50/50 dark:hover:bg-brand-500/10 text-left"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Avatar src={gUser.avatar_url} online={gUser.is_online} size="lg" />
                      <div className="flex flex-col truncate">
                        <span className="font-semibold text-sm truncate">{gUser.display_name}</span>
                        <span className="text-xs text-zinc-400">@{gUser.username} • Tap to message</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/20 px-2.5 py-1 rounded-full">
                      Start Chat
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <MessageSquare className="h-8 w-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-semibold">No chats found</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Search global profiles above or start a new conversation.
            </p>
            <Button onClick={() => setIsModalOpen(true)}>New Chat</Button>
          </div>
        )}
      </div>

      {/* Hold / Options Context Action Sheet (Remove, Block, Unread) */}
      {selectedConv && (() => {
        const isSelfSelected = selectedConv.conv.members.length === 1 || selectedConv.conv.members.every(m => m.id === user?.uid);

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150 space-y-2">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Avatar src={selectedConv.targetUser.avatar_url} size="md" />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{selectedConv.targetUser.display_name}</span>
                      {isSelfSelected && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400">@{selectedConv.targetUser.username}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedConv(null)} className="p-1 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X size={18} />
                </button>
              </div>

              {/* Unread / Read Toggle Button */}
              <button 
                onClick={() => {
                  toggleUnread(selectedConv.conv.id);
                  const isUnread = !!selectedConv.conv.unreadCount;
                  toast.success(isUnread ? 'Marked as read' : 'Marked as unread');
                  setSelectedConv(null);
                }}
                className="flex w-full items-center gap-3 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <Mail size={20} className="text-brand-500" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">
                    {selectedConv.conv.unreadCount ? 'Mark as Read' : 'Mark as Unread'}
                  </span>
                  <span className="text-xs text-zinc-400">Toggle unread status badge for this profile</span>
                </div>
              </button>

              {!isSelfSelected ? (
                <>
                  {/* Block / Unblock Profile Button */}
                  <button 
                    onClick={() => {
                      const targetId = selectedConv.targetUser.id;
                      const isBlocked = blockedUserIds.includes(targetId);
                      if (isBlocked) {
                        unblockUser(targetId);
                        toast.success(`Unblocked ${selectedConv.targetUser.display_name}`);
                      } else {
                        blockUser(targetId);
                        toast.success(`Blocked ${selectedConv.targetUser.display_name}`);
                      }
                      setSelectedConv(null);
                    }}
                    className="flex w-full items-center gap-3 p-3 rounded-2xl hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-700 dark:text-amber-400 transition-colors text-left"
                  >
                    <Ban size={20} />
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">
                        {blockedUserIds.includes(selectedConv.targetUser.id) ? 'Unblock Profile' : 'Block Profile'}
                      </span>
                      <span className="text-xs opacity-80">Restrict or allow messages from this contact</span>
                    </div>
                  </button>

                  {/* Remove / Delete Chat Button */}
                  <button 
                    onClick={() => {
                      const targetConvId = selectedConv.conv.id;
                      const targetName = selectedConv.targetUser.display_name;
                      setSelectedConv(null);
                      setDeletingConv({ id: targetConvId, name: targetName });
                    }}
                    className="flex w-full items-center gap-3 p-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors text-left"
                  >
                    <Trash2 size={20} />
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">Remove Profile Chat</span>
                      <span className="text-xs opacity-80">Delete chat history permanently</span>
                    </div>
                  </button>
                </>
              ) : (
                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                  <AlertCircle size={16} className="text-brand-500 shrink-0" />
                  <span>Your personal self-chat space cannot be deleted or blocked.</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Delete Chat Confirmation Modal */}
      {deletingConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-500 dark:bg-red-500/20">
              <AlertCircle size={28} />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Delete Chat?</h3>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Are you sure you want to delete the chat with <span className="font-semibold text-zinc-800 dark:text-zinc-200">{deletingConv.name}</span>? This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeletingConv(null)}
                className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
              >
                No, Cancel
              </button>
              <button
                onClick={confirmDeleteChat}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 shadow-md shadow-red-500/20"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <NewChatModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
