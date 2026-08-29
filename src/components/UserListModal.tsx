import React, { useEffect, useState } from 'react';
import { X, Search } from 'lucide-react';
import { Avatar } from './ui/Avatar';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';

interface UserListModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  type: 'followers' | 'following';
  onUserClick?: (userId: string) => void;
}

export default function UserListModal({ isOpen, onClose, userId, type, onUserClick }: UserListModalProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const path = type === 'followers' 
          ? `followers/${userId}/userFollowers`
          : `following/${userId}/userFollowing`;
        
        const q = query(collection(db, path));
        const snapshot = await getDocs(q);
        
        const userPromises = snapshot.docs.map(async (d) => {
          const userData = d.data();
          const userSnap = await getDoc(doc(db, 'users', d.id));
          if (userSnap.exists()) {
            return { id: d.id, ...userSnap.data() };
          }
          return { id: d.id, display_name: 'Unknown User' };
        });

        const fetchedUsers = await Promise.all(userPromises);
        setUsers(fetchedUsers);
      } catch (err) {
        console.error("Error fetching user list:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isOpen, userId, type]);

  if (!isOpen) return null;

  const filteredUsers = users.filter(u => 
    u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex h-full max-h-[600px] w-full max-w-md flex-col rounded-[2rem] bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-zinc-100 p-4 dark:border-zinc-800">
          <h2 className="text-xl font-bold capitalize">{type}</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-brand-500"></div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-zinc-500">
              <p>No users found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map((u) => (
                <div 
                  key={u.id}
                  onClick={() => {
                    if (onUserClick) {
                      onUserClick(u.id);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-3 rounded-2xl p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                >
                  <Avatar src={u.avatar_url} size="md" />
                  <div className="flex flex-col">
                    <span className="font-semibold">{u.display_name}</span>
                    <span className="text-xs text-zinc-500">@{u.username}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
