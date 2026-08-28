import { create } from 'zustand';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, onSnapshot, query, where, orderBy, getDocs, deleteDoc, updateDoc, serverTimestamp, writeBatch, getDoc } from 'firebase/firestore';
import { useAuthStore } from './authStore';
import { encryptText, decryptText } from '../lib/encryption';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'poll';

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
  type: 'direct' | 'group' | 'community';
  created_at: string;
  updated_at: string;
  members: any[];
  lastMessage?: Message;
  unreadCount?: number;
  typing?: Record<string, number | null>;
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
  setTypingStatus: (conversationId: string, isTyping: boolean) => Promise<void>;
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
    localStorage.setItem('oqchat_blocked_users', JSON.stringify(newBlocked));
    return { blockedUserIds: newBlocked };
  }),

  unblockUser: (userId) => set((state) => {
    const newBlocked = state.blockedUserIds.filter(id => id !== userId);
    localStorage.setItem('oqchat_blocked_users', JSON.stringify(newBlocked));
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
    const encryptedContent = newContent ? await encryptText(newContent, conversationId) : newContent;
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
      content: encryptedContent,
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
    const encryptedContent = content ? await encryptText(content, conversationId) : content;
    const encryptedMediaUrl = mediaUrl ? await encryptText(mediaUrl, conversationId) : mediaUrl;

    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.uid,
      content: encryptedContent,
      message_type: type || 'text',
      media_url: encryptedMediaUrl,
      reply_to: replyToId || null,
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
        type: currentConv.type || 'direct',
        created_at: currentConv.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        memberIds: (currentConv.members || []).map(m => m.id)
      }, { merge: true });
    }

    // Save message
    await setDoc(doc(db, 'conversations', conversationId, 'messages', tempId), tempMessage);
  },
  
  setTypingStatus: async (conversationId, isTyping) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    // We update the typing mapping in the conversation doc
    await setDoc(doc(db, 'conversations', conversationId), {
      typing: {
        [user.uid]: isTyping ? new Date().getTime() : null
      }
    }, { merge: true }).catch(console.error);
  },

  fetchConversations: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    set({ loading: true });
    const savedBlocked = localStorage.getItem('oqchat_blocked_users');
    set({ blockedUserIds: savedBlocked ? JSON.parse(savedBlocked) : [] });

    if (unsubConversations) unsubConversations();
    
    const q = query(collection(db, 'conversations'), where('memberIds', 'array-contains', user.uid));
    unsubConversations = onSnapshot(q, async (snapshot) => {
      try {
        const convPromises = snapshot.docs.map(async (d) => {
          const data = d.data();
          const memberIds = data.memberIds || [];
          
          const memberPromises = memberIds.map(async (mId: string) => {
            try {
              const mSnap = await getDoc(doc(db, 'users', mId));
              if (mSnap.exists()) {
                return { id: mId, ...mSnap.data() };
              }
            } catch (err) {
              console.error(`Error loading user profile for ${mId}:`, err);
            }
            return { id: mId, username: 'Unknown', display_name: 'Unknown' };
          });
          
          const members = await Promise.all(memberPromises);
          
          return {
            id: d.id,
            type: data.type,
            created_at: data.created_at,
            updated_at: data.updated_at,
            members: members,
            typing: data.typing
          };
        });

        const convs = await Promise.all(convPromises);

        // Bind messages snapshots
        convs.forEach((c) => {
          if (!unsubMessages[c.id]) {
            const mq = query(collection(db, 'conversations', c.id, 'messages'), orderBy('created_at', 'asc'));
            unsubMessages[c.id] = onSnapshot(mq, (mSnap) => {
              const msgs = mSnap.docs.map(md => md.data() as Message);
              Promise.all(msgs.map(async (msg) => {
                const decryptedContent = msg.content ? await decryptText(msg.content, c.id) : msg.content;
                const decryptedMediaUrl = msg.media_url ? await decryptText(msg.media_url, c.id) : msg.media_url;
                return {
                  ...msg,
                  content: decryptedContent,
                  media_url: decryptedMediaUrl
                };
              })).then((decryptedMsgs) => {
                get().setMessages(c.id, decryptedMsgs);
                
                if (decryptedMsgs.length > 0) {
                   set(state => ({
                     conversations: state.conversations.map(convItem => 
                       convItem.id === c.id ? { ...convItem, lastMessage: decryptedMsgs[decryptedMsgs.length - 1] } : convItem
                     )
                   }));
                }
              });
            }, (error) => {
              console.error("Messages subscription error:", error);
            });
          }
        });

        set({ conversations: convs, loading: false });
      } catch (err) {
        console.error("Error updating conversations list snapshot:", err);
        set({ loading: false });
      }
    }, (error) => {
      console.error("Conversations snapshot subscription failed:", error);
      set({ loading: false });
    });
  }
}));
