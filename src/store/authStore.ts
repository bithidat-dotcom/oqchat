import { create } from 'zustand';
import { db } from '../lib/firebase';
import { doc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_online: boolean;
  last_seen: string;
}

interface AuthState {
  user: { uid: string, phone: string } | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  onlineUsers: Record<string, any>;
  setUser: (user: { uid: string, phone: string } | null) => void;
  setProfile: (profile: Profile | null) => void;
  initialize: () => void;
  signOut: () => Promise<void>;
  trackPresence: () => void;
  signIn: (phone: string, password?: string) => Promise<void>;
  signUp: (phone: string, password?: string) => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,
  onlineUsers: {},
  
  setUser: (user) => set({ user }),
  
  setProfile: (profile) => set({ profile }),

  updateProfile: async (updates) => {
    const { user, profile } = get();
    if (!user || !profile) return;
    
    await updateDoc(doc(db, 'users', user.uid), updates as any);
  },
  
  trackPresence: () => {
    const { user } = get();
    if (user) {
      updateDoc(doc(db, 'users', user.uid), {
        is_online: true,
        last_seen: new Date().toISOString()
      }).catch(() => {});
    }
  },

  signIn: async (phone, password) => {
    if (!password) throw new Error("Password required");
    const q = query(collection(db, 'users_auth'), where('phone', '==', phone), where('password', '==', password));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      throw new Error("Invalid phone number or password");
    }
    
    const uid = snapshot.docs[0].id;
    localStorage.setItem('oqchat_uid', uid);
    localStorage.setItem('oqchat_phone', phone);
    get().initialize();
  },

  signUp: async (phone, password) => {
    if (!password) throw new Error("Password required");
    
    const q = query(collection(db, 'users_auth'), where('phone', '==', phone));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      throw new Error("Phone number already registered");
    }
    
    const uid = crypto.randomUUID();
    
    await setDoc(doc(db, 'users_auth', uid), {
      uid,
      phone,
      password,
      created_at: new Date().toISOString()
    });
    
    localStorage.setItem('oqchat_uid', uid);
    localStorage.setItem('oqchat_phone', phone);
    get().initialize();
  },
  
  initialize: () => {
    const uid = localStorage.getItem('oqchat_uid');
    const phone = localStorage.getItem('oqchat_phone');
    
    if (uid && phone) {
      set({ user: { uid, phone } });
      
      onSnapshot(doc(db, 'users', uid), (docSnap) => {
        if (docSnap.exists()) {
          set({ profile: docSnap.data() as Profile });
        } else {
          set({ profile: null });
        }
      }, (error) => {
        console.error("Error fetching profile", error);
      });
      
      // Optimistic presence
      setDoc(doc(db, 'users', uid), {
        is_online: true,
        last_seen: new Date().toISOString()
      }, { merge: true }).catch(() => {});

      set({ loading: false, initialized: true });
    } else {
      set({ user: null, profile: null, loading: false, initialized: true });
    }
  },

  signOut: async () => {
    const { user } = get();
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), {
        is_online: false,
        last_seen: new Date().toISOString()
      }).catch(() => {});
    }
    
    localStorage.removeItem('oqchat_uid');
    localStorage.removeItem('oqchat_phone');
    set({ user: null, profile: null });
  }
}));
