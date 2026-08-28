import React, { useState, useEffect } from 'react';
import { Search, X, Loader2, Users, Globe, Shield, ShieldCheck, User, Check, Plus } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';
import { compressImage } from '../../lib/imageUtils';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModeType = 'direct' | 'group' | 'community';
type UserRole = 'member' | 'admin' | 'co_admin';

export default function NewChatModal({ isOpen, onClose }: NewChatModalProps) {
  const [mode, setMode] = useState<ModeType>('direct');
  const [query, setQuery] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Group creation state
  const [groupName, setGroupName] = useState('');
  const [groupAvatar, setGroupAvatar] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Community creation state
  const [communityName, setCommunityName] = useState('');
  const [communityDesc, setCommunityDesc] = useState('');
  const [communityAvatar, setCommunityAvatar] = useState('');
  const [userRoles, setUserRoles] = useState<Record<string, UserRole>>({});

  const { user, profile: currentUserProfile } = useAuthStore();
  const { conversations, fetchConversations } = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setAllUsers([]);
      setResults([]);
      setGroupName('');
      setGroupAvatar('');
      setSelectedUserIds([]);
      setCommunityName('');
      setCommunityDesc('');
      setCommunityAvatar('');
      setUserRoles({});
      setMode('direct');
      return;
    }

    setLoading(true);
    // Fetch all users from Firestore users collection
    import('../../lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ collection, getDocs }) => {
        getDocs(collection(db, 'users')).then(snap => {
          const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAllUsers(users);
          setLoading(false);
        }).catch(err => {
          console.error("Error fetching users:", err);
          setLoading(false);
        });
      });
    });
  }, [isOpen]);

  useEffect(() => {
    const searchVal = query.trim().toLowerCase();
    if (!searchVal) {
      setResults(allUsers.filter((u: any) => u.id !== user?.uid));
      return;
    }

    const filtered = allUsers.filter((u: any) => 
      u.id !== user?.uid && 
      ((u.username?.toLowerCase() || '').includes(searchVal) || 
       (u.display_name?.toLowerCase() || '').includes(searchVal))
    );
    setResults(filtered);
  }, [query, allUsers, user?.uid]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        const filtered = prev.filter(id => id !== userId);
        const roles = { ...userRoles };
        delete roles[userId];
        setUserRoles(roles);
        return filtered;
      } else {
        setUserRoles(roles => ({ ...roles, [userId]: 'member' }));
        return [...prev, userId];
      }
    });
  };

  const setRoleForUser = (userId: string, role: UserRole) => {
    setUserRoles(prev => ({
      ...prev,
      [userId]: role
    }));
  };

  const startChat = async (targetUserId: string) => {
    if (!currentUserProfile || !user) return;
    const isSelf = targetUserId === currentUserProfile.id;

    // Check if conversation already exists
    const existingConv = conversations.find(c => {
      if (c.type !== 'direct') return false;
      const cIsSelf = c.members.length === 1 || c.members.every(m => m.id === user?.uid);
      if (isSelf) {
        return cIsSelf;
      } else {
        return !cIsSelf && c.members.some(m => m.id === targetUserId);
      }
    });

    if (existingConv) {
      onClose();
      navigate(`/chat/${existingConv.id}`);
      return;
    }

    setLoading(true);
    try {
      const selectedUser = isSelf ? currentUserProfile : allUsers.find((u: any) => u.id === targetUserId);
      if (!selectedUser) {
        setLoading(false);
        return;
      }

      const newConvId = `conv-${crypto.randomUUID()}`;
      const members = isSelf ? [currentUserProfile] : [currentUserProfile, selectedUser];
      const memberIds = members.map(m => m?.id || m?.uid || '').filter(Boolean);

      const { db } = await import('../../lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      // Create conversation document in Firestore
      await setDoc(doc(db, 'conversations', newConvId), {
        id: newConvId,
        type: 'direct',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        memberIds: memberIds
      });

      onClose();
      navigate(`/chat/${newConvId}`);
    } catch (err) {
      console.error("Error creating conversation:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      alert("Please enter a group name");
      return;
    }
    if (!user || !currentUserProfile) return;

    setLoading(true);
    try {
      const newConvId = `group-${crypto.randomUUID()}`;
      const memberIds = [user.uid, ...selectedUserIds];

      const { db } = await import('../../lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      await setDoc(doc(db, 'conversations', newConvId), {
        id: newConvId,
        type: 'group',
        name: groupName.trim(),
        avatar_url: groupAvatar.trim() || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=120&auto=format&fit=crop&q=60',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        memberIds: memberIds,
        admins: [user.uid],
        coAdmins: []
      });

      onClose();
      navigate(`/chat/${newConvId}`);
    } catch (err) {
      console.error("Error creating group:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCommunity = async () => {
    if (!communityName.trim()) {
      alert("Please enter a community name");
      return;
    }
    if (!user || !currentUserProfile) return;

    setLoading(true);
    try {
      const newConvId = `community-${crypto.randomUUID()}`;
      const memberIds = [user.uid, ...selectedUserIds];

      const admins = [user.uid];
      const coAdmins: string[] = [];

      Object.entries(userRoles).forEach(([userId, role]) => {
        if (role === 'admin') {
          admins.push(userId);
        } else if (role === 'co_admin') {
          coAdmins.push(userId);
        }
      });

      const { db } = await import('../../lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      await setDoc(doc(db, 'conversations', newConvId), {
        id: newConvId,
        type: 'community',
        name: communityName.trim(),
        description: communityDesc.trim(),
        avatar_url: communityAvatar.trim() || 'https://images.unsplash.com/photo-1531206715517-5c0ba140e2b8?w=120&auto=format&fit=crop&q=60',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        memberIds: memberIds,
        admins: admins,
        coAdmins: coAdmins
      });

      onClose();
      navigate(`/chat/${newConvId}`);
    } catch (err) {
      console.error("Error creating community:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const showSelfOption = mode === 'direct' && user && currentUserProfile && (
    !query.trim() || 
    'message yourself you notes'.includes(query.toLowerCase()) || 
    currentUserProfile.display_name.toLowerCase().includes(query.toLowerCase()) ||
    currentUserProfile.username.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={24} />
          </button>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Create New</h2>
        </div>
      </div>

      {/* Tabs / Modes */}
      <div className="flex border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <button
          onClick={() => { setMode('direct'); setSelectedUserIds([]); }}
          className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition-all ${
            mode === 'direct'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <User size={16} />
            <span>Direct Message</span>
          </div>
        </button>
        <button
          onClick={() => { setMode('group'); setSelectedUserIds([]); }}
          className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition-all ${
            mode === 'group'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Users size={16} />
            <span>Group Chat</span>
          </div>
        </button>
        <button
          onClick={() => { setMode('community'); setSelectedUserIds([]); }}
          className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition-all ${
            mode === 'community'
              ? 'border-brand-500 text-brand-600 dark:text-brand-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Globe size={16} />
            <span>Community</span>
          </div>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Form elements for group/community creation */}
        {mode === 'group' && (
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Group Name</label>
              <input
                type="text"
                placeholder="E.g. Study Group, Project Team"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Group Cover Image</label>
              <div className="flex items-center gap-3">
                {groupAvatar ? (
                  <div className="relative h-16 w-16 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100">
                    <img src={groupAvatar} alt="Group preview" className="h-full w-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setGroupAvatar('')}
                      className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl-xl hover:bg-red-600 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-400">
                    <span className="text-xs">No Image</span>
                  </div>
                )}
                <div>
                  <input 
                    type="file"
                    id="group-avatar-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const compressed = await compressImage(file);
                          setGroupAvatar(compressed);
                        } catch (err) {
                          console.error("Error compressing group image:", err);
                        }
                      }
                    }}
                  />
                  <label 
                    htmlFor="group-avatar-upload"
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors"
                  >
                    Select from Gallery
                  </label>
                  <p className="text-[10px] text-zinc-400 mt-1">Upload a custom cover image</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {mode === 'community' && (
          <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Community Name</label>
              <input
                type="text"
                placeholder="E.g. Developers Hub, Music Lovers"
                value={communityName}
                onChange={(e) => setCommunityName(e.target.value)}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-800 dark:bg-zinc-950"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Description</label>
              <textarea
                placeholder="E.g. A community dedicated to discussions on web development..."
                value={communityDesc}
                onChange={(e) => setCommunityDesc(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-800 dark:bg-zinc-950 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Community Avatar</label>
              <div className="flex items-center gap-3">
                {communityAvatar ? (
                  <div className="relative h-16 w-16 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100">
                    <img src={communityAvatar} alt="Community preview" className="h-full w-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setCommunityAvatar('')}
                      className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-bl-xl hover:bg-red-600 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-400">
                    <span className="text-xs">No Image</span>
                  </div>
                )}
                <div>
                  <input 
                    type="file"
                    id="community-avatar-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const compressed = await compressImage(file);
                          setCommunityAvatar(compressed);
                        } catch (err) {
                          console.error("Error compressing community image:", err);
                        }
                      }
                    }}
                  />
                  <label 
                    htmlFor="community-avatar-upload"
                    className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors"
                  >
                    Select from Gallery
                  </label>
                  <p className="text-[10px] text-zinc-400 mt-1">Upload a custom community avatar</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selected Members list for Groups/Communities */}
        {mode !== 'direct' && selectedUserIds.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
              Selected Members ({selectedUserIds.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedUserIds.map(id => {
                const u = allUsers.find(userObj => userObj.id === id);
                if (!u) return null;
                const role = userRoles[id] || 'member';
                return (
                  <div key={id} className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 rounded-full pl-2 pr-1 py-1">
                    <Avatar src={u.avatar_url} size="sm" />
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{u.display_name}</span>
                    
                    {mode === 'community' && (
                      <select
                        value={role}
                        onChange={(e) => setRoleForUser(id, e.target.value as UserRole)}
                        className="text-[10px] font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-1 text-brand-600 dark:text-brand-400 focus:outline-none"
                      >
                        <option value="member">Member</option>
                        <option value="co_admin">Co-Admin</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}

                    <button 
                      onClick={() => toggleUserSelection(id)}
                      className="p-1 rounded-full bg-brand-100 hover:bg-brand-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-brand-700 dark:text-zinc-300"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Search for users */}
        <div>
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
            {mode === 'direct' ? 'Search Profiles' : 'Add Members'}
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by name or @username..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm focus:ring-2 focus:ring-brand-500/20 dark:border-zinc-800 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50"
            />
          </div>
        </div>

        {/* Search Results List */}
        <div className="space-y-1">
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
            <div className="space-y-1.5">
              {results.map((profile) => {
                const isSelected = selectedUserIds.includes(profile.id);
                return (
                  <button
                    key={profile.id}
                    onClick={() => {
                      if (mode === 'direct') {
                        startChat(profile.id);
                      } else {
                        toggleUserSelection(profile.id);
                      }
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl p-3 text-left transition-all border ${
                      isSelected 
                        ? 'bg-brand-50/50 border-brand-200 dark:bg-brand-500/10 dark:border-brand-500/20' 
                        : 'border-transparent hover:bg-zinc-100 active:bg-zinc-200 dark:hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar src={profile.avatar_url} size="md" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">{profile.display_name}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">@{profile.username}</span>
                      </div>
                    </div>

                    {mode !== 'direct' && (
                      <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-brand-500 border-brand-500 text-white' 
                          : 'border-zinc-300 dark:border-zinc-700'
                      }`}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : query.trim() ? (
            !showSelfOption && (
              <div className="p-8 text-center text-zinc-500">
                No users found matching "{query}"
              </div>
            )
          ) : (
            <div className="p-4 text-center text-xs text-zinc-400">
              No active profiles found
            </div>
          )}
        </div>
      </div>

      {/* Footer trigger to create Group or Community */}
      {mode !== 'direct' && (
        <div className="p-4 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-center text-sm font-semibold rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={mode === 'group' ? handleCreateGroup : handleCreateCommunity}
            disabled={mode === 'group' ? !groupName.trim() : !communityName.trim()}
            className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl text-white transition-all shadow-md ${
              (mode === 'group' ? groupName.trim() : communityName.trim())
                ? 'bg-brand-500 hover:bg-brand-600 shadow-brand-500/20'
                : 'bg-zinc-400 cursor-not-allowed shadow-none'
            }`}
          >
            {mode === 'group' ? 'Create Group' : 'Create Community'}
          </button>
        </div>
      )}
    </div>
  );
}
