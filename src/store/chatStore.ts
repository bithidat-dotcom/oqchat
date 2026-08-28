import { create } from 'zustand';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, onSnapshot, query, where, orderBy, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { useAuthStore } from './authStore';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: MessageType;
  media_url: string | null;
  reply_to: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  created_at: string;
  updated_at: string;
  members: any[];
  lastMessage?: Message;
  unreadCount?: number;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: string | null;
  messages: Record<string, Message[]>;
  loading: boolean;
  blockedUserIds: string[];
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null) => void;
  toggleUnread: (conversationId: string) => void;
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  editMessage: (conversationId: string, messageId: string, newContent: string) => void;
  deleteConversation: (conversationId: string) => void;
  clearMessages: (conversationId: string) => void;
  sendMessage: (conversationId: string, content: string, type?: MessageType, mediaUrl?: string, replyToId?: string | null) => Promise<void>;
  fetchConversations: () => Promise<void>;
}

let unsubConversations: (() => void) | null = null;
let unsubMessages: Record<string, () => void> = {};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: {},
  loading: false,
  blockedUserIds: [],
  
  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (id) => set({ activeConversation: id }),
  
  toggleUnread: (conversationId) => set((state) => {
    const newConvs = state.conversations.map(c => {
      if (c.id === conversationId) {
        return { ...c, unreadCount: c.unreadCount ? 0 : 1 };
      }
      return c;
    });
    return { conversations: newConvs };
  }),

  blockUser: (userId) => set((state) => {
    const newBlocked = Array.from(new Set([...state.blockedUserIds, userId]));
    localStorage.setItem('gazzchat_blocked_users', JSON.stringify(newBlocked));
    return { blockedUserIds: newBlocked };
  }),

  unblockUser: (userId) => set((state) => {
    const newBlocked = state.blockedUserIds.filter(id => id !== userId);
    localStorage.setItem('gazzchat_blocked_users', JSON.stringify(newBlocked));
    return { blockedUserIds: newBlocked };
  }),
  
  addMessage: (message) => set((state) => ({
    messages: {
      ...state.messages,
      [message.conversation_id]: [...(state.messages[message.conversation_id] || []), message]
    }
  })),
  
  updateMessage: (message) => set((state) => ({
    messages: {
      ...state.messages,
      [message.conversation_id]: (state.messages[message.conversation_id] || []).map(m => 
        m.id === message.id ? message : m
      )
    }
  })),
  
  setMessages: (conversationId, messages) => set((state) => ({
    messages: {
      ...state.messages,
      [conversationId]: messages
    }
  })),

  deleteMessage: async (conversationId, messageId) => {
    await deleteDoc(doc(db, 'conversations', conversationId, 'messages', messageId));
  },

  editMessage: async (conversationId, messageId, newContent) => {
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
      content: newContent,
      updated_at: new Date().toISOString()
    });
  },

  deleteConversation: async (conversationId) => {
    await deleteDoc(doc(db, 'conversations', conversationId));
  },

  clearMessages: async (conversationId) => {
    // In a real app we'd delete all docs in the subcollection using a batch or Edge function
    // For now we just clear local state for this demo
    set((state) => ({
      messages: { ...state.messages, [conversationId]: [] }
    }));
  },
  
  sendMessage: async (conversationId, content, type = 'text', mediaUrl = null, replyToId = null) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const tempId = crypto.randomUUID();
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.uid,
      content,
      message_type: type,
      media_url: mediaUrl,
      reply_to: replyToId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      status: 'sending'
    };

    // Make sure conversation exists in Firestore
    const currentConv = get().conversations.find(c => c.id === conversationId);
    if (currentConv) {
      await setDoc(doc(db, 'conversations', conversationId), {
        id: conversationId,
        type: currentConv.type,
        created_at: currentConv.created_at,
        updated_at: new Date().toISOString(),
        memberIds: currentConv.members.map(m => m.id)
      }, { merge: true });
    }

    // Save message
    await setDoc(doc(db, 'conversations', conversationId, 'messages', tempId), tempMessage);
  },
  
  fetchConversations: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    set({ loading: true });
    const savedBlocked = localStorage.getItem('gazzchat_blocked_users');
    set({ blockedUserIds: savedBlocked ? JSON.parse(savedBlocked) : [] });

    if (unsubConversations) unsubConversations();
    
    const q = query(collection(db, 'conversations'), where('memberIds', 'array-contains', user.uid));
    unsubConversations = onSnapshot(q, async (snapshot) => {
      const convs: Conversation[] = [];
      
      for (const d of snapshot.docs) {
        const data = d.data();
        // Fetch member profiles
        const members = [];
        for (const mId of data.memberIds) {
          const mSnap = await getDoc(doc(db, 'users', mId));
          if (mSnap.exists()) {
            members.push({ id: mId, ...mSnap.data() });
          } else {
            members.push({ id: mId, username: 'Unknown', display_name: 'Unknown' });
          }
        }
        
        convs.push({
          id: d.id,
          type: data.type,
          created_at: data.created_at,
          updated_at: data.updated_at,
          members: members
        });

        // Listen to messages for this conversation if not already listening
        if (!unsubMessages[d.id]) {
          const mq = query(collection(db, 'conversations', d.id, 'messages'), orderBy('created_at', 'asc'));
          unsubMessages[d.id] = onSnapshot(mq, (mSnap) => {
            const msgs = mSnap.docs.map(md => md.data() as Message);
            get().setMessages(d.id, msgs);
            
            // update last message and unread count locally (can be expanded)
            if (msgs.length > 0) {
               set(state => ({
                 conversations: state.conversations.map(c => 
                   c.id === d.id ? { ...c, lastMessage: msgs[msgs.length - 1] } : c
                 )
               }));
            }
          });
        }
      }
      
      set({ conversations: convs, loading: false });
    });
  }
}));
