import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore, Message } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useCallStore } from '../store/callStore';
import { Avatar } from '../components/ui/Avatar';
import { ChevronLeft, Phone, Video, MoreVertical, Send, Paperclip, Smile, Mic, Search, X, Play, Pause, Image as ImageIcon, VolumeX, Volume2, Trash2, Reply, Forward, Edit2, CornerDownRight, Check, AlertCircle, BarChart2, Shield, ShieldAlert, ShieldCheck, Award, Plus, Trash, Globe, Users } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { compressImage } from '../lib/imageUtils';
import { encryptText, decryptText } from '../lib/encryption';

const EMOJI_LIST = ['😊', '😂', '❤️', '👍', '🔥', '🎉', '🚀', '😍', '😭', '🙏', '✨', '😎', '💬', '📱', '💡', '🥳', '👏', '💯', '🌟', '🍕', '☕', '🎧', '🎁', '⚽', '📸', '🔑', '🏆', '📌', '💙', '🟢'];

export default function ChatScreen() {
  const { id: conversationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, onlineUsers, profile: currentUserProfile } = useAuthStore();
  const { conversations, messages, sendMessage, clearMessages, deleteMessage, editMessage, fetchConversations } = useChatStore();
  const { setActiveCall, setCalling } = useCallStore();
  
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [time, setTime] = useState(Date.now());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Message Context Action Menu Modal (on message click)
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);

  // Edit Message state
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');

  // Reply state
  const [replyToMsg, setReplyToMsg] = useState<Message | null>(null);

  // Selected image preview state before sending
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Forward Modal state
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Poll creation state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  // Playing audio message state
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep a live timer running to refresh relative calculations like typing indicator
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const [localConversation, setLocalConversation] = useState<any>(null);
  const storeConversation = conversations.find(c => c.id === conversationId);
  const conversation = storeConversation || localConversation;

  useEffect(() => {
    if (!conversationId || storeConversation) return;

    const fetchLocalConv = async () => {
      try {
        const { db } = await import('../lib/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        const docSnap = await getDoc(doc(db, 'conversations', conversationId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          const memberIds = data.memberIds || [];
          const memberPromises = memberIds.map(async (mId: string) => {
            const mSnap = await getDoc(doc(db, 'users', mId));
            if (mSnap.exists()) {
              return { id: mId, ...mSnap.data() };
            }
            return { id: mId, username: 'Unknown', display_name: 'Unknown' };
          });
          const members = await Promise.all(memberPromises);
          setLocalConversation({
            id: docSnap.id,
            type: data.type,
            created_at: data.created_at,
            updated_at: data.updated_at,
            members: members,
            typing: data.typing
          });
        }
      } catch (err) {
        console.error("Error fetching local conversation fallback:", err);
      }
    };

    fetchLocalConv();
  }, [conversationId, storeConversation]);

  const rawMessages = conversationId ? messages[conversationId] || [] : [];
  
  const chatMessages = searchQuery.trim() 
    ? rawMessages.filter(m => m.content && m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawMessages;

  const isGroupOrCommunity = conversation?.type === 'group' || conversation?.type === 'community';
  const isSelf = !isGroupOrCommunity && (conversation?.members.length === 1 || conversation?.members.every(m => m.id === user?.uid));
  const otherMember = isGroupOrCommunity
    ? {
        id: conversation.id,
        display_name: conversation.name || (conversation.type === 'group' ? 'Group Chat' : 'Community'),
        avatar_url: conversation.avatar_url || '',
        is_online: false,
        bio: conversation.description || 'Welcome to this chat space!',
        isGroup: true,
        type: conversation.type,
        admins: conversation.admins || [],
        coAdmins: conversation.coAdmins || [],
        membersList: conversation.members || []
      }
    : (isSelf ? currentUserProfile : (conversation?.members.find(m => m.id !== user?.uid) || conversation?.members[0]));
  const isOnline = isGroupOrCommunity ? false : (isSelf ? true : (otherMember ? !!onlineUsers[otherMember.id] || otherMember.is_online : false));
  
  // Guard otherTypingTimestamp so we never check our own typing state
  const otherTypingTimestamp = (otherMember && otherMember.id !== user?.uid && !isGroupOrCommunity) 
    ? (conversation?.typing?.[otherMember.id] || null) 
    : null;
  const isTyping = otherTypingTimestamp ? (time - otherTypingTimestamp < 3000) : false;

  const getPresenceText = () => {
    if (isGroupOrCommunity) {
      const typeLabel = conversation?.type === 'group' ? 'Group Chat' : 'Community';
      return `${conversation?.members?.length || 0} members • ${typeLabel}`;
    }
    if (isSelf) return 'Message yourself (Notes, links, media)';
    if (isTyping) return 'typing...';
    
    // Bangladesh sleeping logic
    const bdTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
    const bdHour = new Date(bdTime).getHours();
    const isNightInBd = bdHour >= 22 || bdHour < 6; // 10 PM to 6 AM
    
    if (!isOnline && isNightInBd) return 'Sleeping 🌙';
    return isOnline ? 'Online' : 'Offline';
  };

  const handleCall = (type: 'voice' | 'video') => {
    if (!otherMember || !user) return;
    setCalling(true);
    setActiveCall({
      caller: user.uid,
      receiver: isSelf ? user.uid : otherMember.id,
      type,
      status: 'initiating'
    });
  };

  useEffect(() => {
    if (!conversationId) return;
    fetchConversations();
    setLoading(false);
    scrollToBottom();
  }, [conversationId, user?.uid, otherMember?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages.length]);

   const scrollToBottom = () => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleVote = async (msg: Message, optionIndex: string) => {
    if (!conversationId || !user) return;
    try {
      let pollData;
      try {
        pollData = JSON.parse(msg.content || '{}');
      } catch (err) {
        return;
      }
      
      if (!pollData.votes) {
        pollData.votes = {};
      }
      
      if (!pollData.votes[optionIndex]) {
        pollData.votes[optionIndex] = [];
      }
      
      const currentVotes = pollData.votes[optionIndex] as string[];
      if (currentVotes.includes(user.uid)) {
        pollData.votes[optionIndex] = currentVotes.filter(uid => uid !== user.uid);
      } else {
        // Toggle on
        pollData.votes[optionIndex] = [...currentVotes, user.uid];
      }
      
      const updatedJson = JSON.stringify(pollData);
      const encryptedJson = await encryptText(updatedJson, conversationId);
      
      const { db } = await import('../lib/firebase');
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'conversations', conversationId, 'messages', msg.id), {
        content: encryptedJson,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error voting on poll:", err);
    }
  };

  const handleCreatePoll = async () => {
    if (!pollQuestion.trim()) {
      toast.error("Please enter a question");
      return;
    }
    const filteredOptions = pollOptions.map(o => o.trim()).filter(Boolean);
    if (filteredOptions.length < 2) {
      toast.error("Please provide at least 2 options");
      return;
    }
    
    if (!conversationId) return;

    try {
      const pollData = {
        question: pollQuestion.trim(),
        options: filteredOptions,
        votes: filteredOptions.reduce((acc, _, idx) => {
          acc[idx] = [];
          return acc;
        }, {} as Record<number, string[]>)
      };

      const pollJson = JSON.stringify(pollData);
      
      await sendMessage(conversationId, pollJson, 'poll');
      
      // Reset
      setPollQuestion('');
      setPollOptions(['', '']);
      setShowPollCreator(false);
      toast.success("Poll created successfully!");
    } catch (err) {
      console.error("Error creating poll:", err);
      toast.error("Failed to create poll");
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    if (!isSelf && conversationId) {
      useChatStore.getState().setTypingStatus(conversationId, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        useChatStore.getState().setTypingStatus(conversationId, false);
      }, 2000);
    }
  };

  // Start real browser voice recording
  const startVoiceRecording = async () => {
    try {
      audioChunksRef.current = [];
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start();
      }
    } catch (err) {
      console.log('MediaRecorder fallback used', err);
    }

    setIsRecording(true);
    setRecordingSeconds(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopAndSendVoiceRecording = async () => {
    if (!conversationId) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    const duration = recordingSeconds || 1;

    let audioUrl: string | null = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      await new Promise((res) => setTimeout(res, 200));
      if (audioChunksRef.current.length > 0) {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        audioUrl = URL.createObjectURL(audioBlob);
      }
    }

    setIsRecording(false);
    setRecordingSeconds(0);

    await sendMessage(
      conversationId,
      `Voice note (${duration}s)`,
      'audio',
      audioUrl,
      replyToMsg ? replyToMsg.id : null
    );

    setReplyToMsg(null);
    toast.success('MP3 Voice message sent');
    scrollToBottom();
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    toast('Voice recording cancelled');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRecording) {
      stopAndSendVoiceRecording();
      return;
    }

    if (selectedImage && conversationId) {
      setIsSendingMedia(true);
      try {
        const text = content.trim();
        const replyId = replyToMsg ? replyToMsg.id : null;
        setContent('');
        setReplyToMsg(null);
        setSelectedImage(null);
        await sendMessage(conversationId, text, 'image', selectedImage, replyId);
        scrollToBottom();
        toast.success('Image sent');
      } catch (error) {
        toast.error('Failed to send image');
      } finally {
        setIsSendingMedia(false);
      }
      return;
    }

    if (!content.trim() || !conversationId) {
      if (!content.trim()) {
        startVoiceRecording();
      }
      return;
    }
    
    const text = content;
    const replyId = replyToMsg ? replyToMsg.id : null;
    setContent('');
    setReplyToMsg(null);
    setShowEmojiPicker(false);

    await sendMessage(conversationId, text, 'text', null, replyId);
    scrollToBottom();
  };

  const handleEmojiSelect = (emoji: string) => {
    setContent(prev => prev + emoji);
  };

  const handleClearChat = () => {
    if (!conversationId) return;
    if (window.confirm('Are you sure you want to clear all messages in this chat?')) {
      clearMessages(conversationId);
      setShowMoreMenu(false);
      toast.success('Chat history cleared');
    }
  };

  // Handle Forward Message
  const handleForwardTo = async (targetConvId: string) => {
    if (!forwardingMsg) return;
    await sendMessage(
      targetConvId,
      forwardingMsg.content || (forwardingMsg.message_type === 'image' ? 'Forwarded Photo' : 'Forwarded Voice Note'),
      forwardingMsg.message_type,
      forwardingMsg.media_url
    );
    toast.success('Message forwarded successfully');
    setForwardingMsg(null);
  };

  // Handle Save Edited Message
  const handleSaveEdit = () => {
    if (!conversationId || !editingMsg) return;
    const messageAgeMs = new Date().getTime() - new Date(editingMsg.created_at).getTime();
    if (messageAgeMs > 30 * 60 * 1000) {
      toast.error('Messages can only be edited within 30 minutes of sending');
      setEditingMsg(null);
      return;
    }
    if (!editText.trim()) {
      toast.error('Message content cannot be empty');
      return;
    }
    editMessage(conversationId, editingMsg.id, editText.trim());
    toast.success('Message edited');
    setEditingMsg(null);
  };

  const imageMessages = rawMessages.filter(m => m.message_type === 'image' && m.media_url);

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950 relative">
      {/* Search Header Bar if active */}
      {showSearch ? (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950 z-20">
          <Search size={20} className="text-zinc-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in conversation..."
            className="flex-1 bg-transparent border-none text-base focus:outline-none dark:text-zinc-100"
            autoFocus
          />
          <button 
            onClick={() => {
              setShowSearch(false);
              setSearchQuery('');
            }}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={20} />
          </button>
        </header>
      ) : (
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/80 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80 z-20 relative">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <ChevronLeft size={24} />
            </button>
            
            <button 
              onClick={() => setShowUserProfile(true)}
              className="flex items-center gap-3 text-left transition-colors hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 p-1.5 -ml-1.5 rounded-xl"
            >
              <Avatar src={otherMember?.avatar_url} online={isOnline} size="md" />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">{otherMember?.display_name}</span>
                  {isSelf && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500 text-white uppercase tracking-wider">
                      You
                    </span>
                  )}
                  {isMuted && <VolumeX size={14} className="text-zinc-400" />}
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {getPresenceText()}
                </span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {!isGroupOrCommunity && (
              <>
                <button 
                  onClick={() => handleCall('voice')}
                  title={isSelf ? "Call yourself" : "Voice call"}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                >
                  <Phone size={20} />
                </button>
                <button 
                  onClick={() => handleCall('video')}
                  title={isSelf ? "Video call yourself" : "Video call"}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
                >
                  <Video size={22} />
                </button>
              </>
            )}
            
            <div className="relative">
              <button 
                onClick={() => setShowMoreMenu(prev => !prev)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <MoreVertical size={20} />
              </button>

              {/* Chat Options Dropdown */}
              {showMoreMenu && (
                <div className="absolute right-0 top-12 w-48 rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <button 
                    onClick={() => {
                      setShowSearch(true);
                      setShowMoreMenu(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <Search size={16} />
                    <span>Search Chat</span>
                  </button>
                  <button 
                    onClick={() => {
                      setShowMediaGallery(true);
                      setShowMoreMenu(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <ImageIcon size={16} />
                    <span>Media ({imageMessages.length})</span>
                  </button>
                  <button 
                    onClick={() => {
                      setIsMuted(!isMuted);
                      setShowMoreMenu(false);
                      toast.success(isMuted ? 'Notifications unmuted' : 'Chat muted');
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    <span>{isMuted ? 'Unmute Chat' : 'Mute Notifications'}</span>
                  </button>
                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                  <button 
                    onClick={handleClearChat}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-xl hover:bg-red-50 text-red-600 dark:hover:bg-red-500/10 dark:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Clear Chat</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-500"></div>
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-zinc-400 text-sm">
            No messages here yet. Send a message to get started!
          </div>
        ) : (
          chatMessages.map((msg, index) => {
            const isMe = msg.sender_id === user?.uid;
            const showTime = index === 0 || new Date(msg.created_at).getTime() - new Date(chatMessages[index - 1].created_at).getTime() > 5 * 60 * 1000;
            const isPlaying = playingMsgId === msg.id;

            // Find replied target message
            const repliedToObj = msg.reply_to ? rawMessages.find(m => m.id === msg.reply_to) : null;
            
            return (
              <div key={msg.id} className={cn("flex flex-col group", isMe ? "items-end" : "items-start")}>
                {showTime && (
                  <span className="mb-2 text-[11px] font-medium text-zinc-400 w-full text-center">
                    {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                  </span>
                )}
                
                <div 
                  onClick={() => setSelectedMsg(msg)}
                  className={cn(
                    "max-w-[75%] rounded-2xl text-base shadow-sm overflow-hidden transition-all cursor-pointer relative hover:brightness-95 active:scale-[0.98]",
                    isMe 
                      ? "bg-brand-500 text-white rounded-tr-sm" 
                      : "bg-white text-zinc-900 border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-50 rounded-tl-sm",
                    msg.message_type === 'image' ? "p-1" : "px-4 py-2.5"
                  )}
                >
                  {/* Replied block quote if present */}
                  {repliedToObj && (
                    <div className={cn(
                      "mb-2 p-2 rounded-xl text-xs border-l-4 flex flex-col gap-0.5",
                      isMe ? "bg-white/15 border-white/80 text-white" : "bg-zinc-100 dark:bg-zinc-800 border-brand-500 text-zinc-700 dark:text-zinc-300"
                    )}>
                      <div className="flex items-center gap-1 font-semibold text-[11px]">
                        <CornerDownRight size={12} />
                        <span>Reply</span>
                      </div>
                      <p className="line-clamp-1 italic">
                        {repliedToObj.content || (repliedToObj.message_type === 'image' ? 'Photo' : 'Voice Message')}
                      </p>
                    </div>
                  )}

                  {msg.message_type === 'image' && msg.media_url ? (
                    <img src={msg.media_url} alt="Sent image" className="rounded-xl w-full h-auto object-cover max-h-64" />
                  ) : msg.message_type === 'audio' ? (
                    <div className="flex items-center gap-3 py-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlayingMsgId(isPlaying ? null : msg.id);
                          if (!isPlaying) {
                            setTimeout(() => setPlayingMsgId(null), 3000);
                          }
                        }}
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                          isMe ? "bg-white text-brand-600" : "bg-brand-500 text-white"
                        )}
                      >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                      </button>
                      <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                        <div className="flex items-center gap-1">
                          {[40, 75, 50, 90, 60, 80, 45, 100, 70, 35, 85, 50].map((h, idx) => (
                            <span 
                              key={idx} 
                              className={cn(
                                "w-1 rounded-full transition-all duration-300",
                                isPlaying ? "animate-pulse bg-current opacity-90" : "opacity-40 bg-current"
                              )} 
                              style={{ height: `${(h / 100) * 18}px` }} 
                            />
                          ))}
                        </div>
                        <span className="text-[10px] opacity-80">{msg.content || 'MP3 Voice note'}</span>
                      </div>
                    </div>
                  ) : msg.message_type === 'poll' ? (
                    (() => {
                      let pollData: any = null;
                      try {
                        pollData = JSON.parse(msg.content || '{}');
                      } catch (e) {
                        return <p className="text-sm italic text-red-400">Malformed Poll</p>;
                      }
                      if (!pollData) return null;

                      const votesMap = pollData.votes || {};
                      const totalVotes = Object.values(votesMap).reduce((acc: number, arr: any) => acc + (arr?.length || 0), 0) as number;

                      return (
                        <div className="w-64 sm:w-72 p-1 text-zinc-900 dark:text-zinc-50">
                          <h4 className="font-bold text-sm sm:text-base mb-3 leading-snug">{pollData.question}</h4>
                          <div className="space-y-2.5">
                            {pollData.options.map((opt: string, idx: number) => {
                              const optionIdxStr = String(idx);
                              const optionVoters = votesMap[optionIdxStr] || [];
                              const userVoted = optionVoters.includes(user?.uid);
                              const percentage = totalVotes > 0 ? Math.round((optionVoters.length / totalVotes) * 100) : 0;

                              return (
                                <button
                                  key={idx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleVote(msg, optionIdxStr);
                                  }}
                                  className={cn(
                                    "w-full text-left relative rounded-xl border p-2.5 transition-all overflow-hidden flex flex-col gap-1 hover:brightness-95 active:scale-[0.99]",
                                    userVoted 
                                      ? "border-brand-500 bg-brand-50/50 dark:bg-brand-950/20" 
                                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                                  )}
                                >
                                  <div 
                                    className={cn(
                                      "absolute inset-y-0 left-0 transition-all duration-500 pointer-events-none opacity-10",
                                      userVoted ? "bg-brand-500" : "bg-zinc-400"
                                    )} 
                                    style={{ width: `${percentage}%` }}
                                  />

                                  <div className="flex items-center justify-between font-semibold text-xs sm:text-sm relative z-10">
                                    <span className="truncate pr-2">{opt}</span>
                                    <span className="text-zinc-500 dark:text-zinc-400 shrink-0 font-bold">{percentage}%</span>
                                  </div>

                                  <div className="flex items-center justify-between mt-1 relative z-10 h-5">
                                    <span className="text-[10px] text-zinc-400 font-medium">
                                      {optionVoters.length} {optionVoters.length === 1 ? 'vote' : 'votes'}
                                    </span>

                                    {optionVoters.length > 0 && (
                                      <div className="flex items-center">
                                        {optionVoters.map((voterId: string) => {
                                          const memberObj = conversation?.members?.find((m: any) => m.id === voterId);
                                          return (
                                            <div 
                                              key={voterId} 
                                              title={memberObj?.display_name || 'Voter'}
                                              className="h-4.5 w-4.5 rounded-full border border-white dark:border-zinc-900 overflow-hidden bg-zinc-200 -ml-1.5 first:ml-0 shadow-sm shrink-0"
                                            >
                                              <img 
                                                src={memberObj?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=50'} 
                                                alt="voter" 
                                                className="h-full w-full object-cover" 
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-zinc-400 font-medium mt-3 text-right">
                            Total: {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                          </p>
                        </div>
                      );
                    })()
                  ) : (
                    <p className="break-words">{msg.content}</p>
                  )}
                </div>
                {isMe && msg.status && (
                  <span className="mt-1 text-[10px] text-zinc-400 flex items-center gap-1">
                    {msg.updated_at !== msg.created_at && <span className="italic">(edited)</span>}
                    <span>{msg.status}</span>
                  </span>
                )}
              </div>
            );
          })
        )}
        
        {isTyping && (
          <div className="flex items-start animate-in fade-in duration-200">
            <div className="bg-white border border-zinc-100 dark:bg-zinc-900 dark:border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm inline-flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 font-medium mr-1">typing</span>
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 right-4 left-4 sm:left-auto sm:w-80 p-3 rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Select Emoji</span>
            <button onClick={() => setShowEmojiPicker(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto no-scrollbar p-1">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleEmojiSelect(emoji)}
                className="text-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 p-1.5 rounded-xl transition-transform active:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Bar Input / Voice Recording */}
      <div className="shrink-0 bg-white p-3 border-t border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 pb-safe z-20">
        {/* Active Reply Preview Banner */}
        {replyToMsg && (
          <div className="mb-2 p-2 px-3 rounded-xl bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2 overflow-hidden text-xs">
              <Reply size={16} className="text-brand-500 shrink-0" />
              <span className="font-semibold text-brand-600 dark:text-brand-400 shrink-0">Replying to:</span>
              <span className="truncate text-zinc-600 dark:text-zinc-300">
                {replyToMsg.content || (replyToMsg.message_type === 'image' ? 'Photo' : 'Voice Message')}
              </span>
            </div>
            <button onClick={() => setReplyToMsg(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Selected Image Preview */}
        {selectedImage && (
          <div className="mb-2 p-2 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 shrink-0">
                <img src={selectedImage} alt="Selected preview" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Image selected</span>
                <span className="text-[10px] text-zinc-400 truncate">Ready to send with Send button</span>
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => setSelectedImage(null)} 
              className="p-1.5 text-zinc-400 hover:text-red-500 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
              title="Remove image"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="flex items-center justify-between bg-red-50 dark:bg-red-500/10 rounded-2xl p-2 px-4 border border-red-200 dark:border-red-500/20 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="font-semibold text-red-600 dark:text-red-400 text-sm">
                Recording MP3 {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="p-2 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={stopAndSendVoiceRecording}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 shadow-md"
              >
                <Send size={18} className="ml-0.5" />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <input 
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file && conversationId) {
                  setIsSendingMedia(true);
                  try {
                    const compressed = await compressImage(file);
                    setSelectedImage(compressed);
                    toast.success('Image loaded. Tap Send to share!');
                  } catch (error) {
                    toast.error('Failed to select image');
                  } finally {
                    setIsSendingMedia(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }
                }
              }}
            />
            <button 
              type="button" 
              disabled={isSendingMedia}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors dark:hover:bg-zinc-800 dark:hover:text-zinc-300",
                isSendingMedia ? "opacity-50 cursor-not-allowed" : "hover:bg-zinc-100 hover:text-zinc-600"
              )}
            >
              {isSendingMedia ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              ) : (
                <Paperclip size={20} />
              )}
            </button>

            <button 
              type="button" 
              onClick={() => setShowPollCreator(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
              title="Create Poll"
            >
              <BarChart2 size={20} />
            </button>
            
            <div className="relative flex-1">
              <input
                type="text"
                value={content}
                onChange={handleTyping}
                placeholder={selectedImage ? "Add a caption..." : "Message..."}
                className="w-full rounded-2xl border-none bg-zinc-100 px-4 py-3 pr-10 text-base focus:ring-2 focus:ring-brand-500 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button 
                type="button" 
                onClick={() => setShowEmojiPicker(prev => !prev)}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <Smile size={20} />
              </button>
            </div>
            <button 
              type="submit" 
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200",
                (content.trim() || selectedImage)
                  ? "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/25" 
                  : "bg-brand-500 text-white hover:bg-brand-600 shadow-sm"
              )}
            >
              {(content.trim() || selectedImage) ? <Send size={20} className="ml-0.5" /> : <Mic size={20} />}
            </button>
          </form>
        )}
      </div>

      {/* Message Click Options Action Sheet Modal */}
      {selectedMsg && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-150 space-y-2">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Message Actions</span>
              <button onClick={() => setSelectedMsg(null)} className="p-1 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X size={18} />
              </button>
            </div>

            {/* Reply Button */}
            <button 
              onClick={() => {
                setReplyToMsg(selectedMsg);
                setSelectedMsg(null);
              }}
              className="flex w-full items-center gap-3 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <Reply size={20} className="text-brand-500" />
              <div className="flex flex-col">
                <span className="font-semibold text-sm">Reply</span>
                <span className="text-xs text-zinc-400">Quote this message in your response</span>
              </div>
            </button>

            {/* Forward Button */}
            <button 
              onClick={() => {
                setForwardingMsg(selectedMsg);
                setSelectedMsg(null);
              }}
              className="flex w-full items-center gap-3 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <Forward size={20} className="text-blue-500" />
              <div className="flex flex-col">
                <span className="font-semibold text-sm">Forward</span>
                <span className="text-xs text-zinc-400">Send this message to another chat</span>
              </div>
            </button>

            {/* Edit Button (only for text messages sent by user within 30 minutes) */}
            {(() => {
              const messageAgeMs = selectedMsg ? (new Date().getTime() - new Date(selectedMsg.created_at).getTime()) : 0;
              const isEditable = messageAgeMs < 30 * 60 * 1000;
              
              if (selectedMsg.message_type === 'text' && selectedMsg.sender_id === user?.uid) {
                return (
                  <button 
                    disabled={!isEditable}
                    onClick={() => {
                      if (!isEditable) {
                        toast.error('Messages can only be edited within 30 minutes of sending');
                        return;
                      }
                      setEditingMsg(selectedMsg);
                      setEditText(selectedMsg.content || '');
                      setSelectedMsg(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 p-3 rounded-2xl transition-colors text-left",
                      isEditable 
                        ? "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100" 
                        : "opacity-50 cursor-not-allowed text-zinc-400"
                    )}
                  >
                    <Edit2 size={20} className={cn(isEditable ? "text-amber-500" : "text-zinc-400")} />
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">Edit Text Message</span>
                      <span className="text-xs text-zinc-400">
                        {isEditable ? "Update message content" : "Locked (older than 30 mins)"}
                      </span>
                    </div>
                  </button>
                );
              }
              return null;
            })()}

            {/* Delete Message Button */}
            <button 
              onClick={() => {
                if (conversationId) {
                  deleteMessage(conversationId, selectedMsg.id);
                  toast.success('Message deleted');
                }
                setSelectedMsg(null);
              }}
              className="flex w-full items-center gap-3 p-3 rounded-2xl hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors text-left"
            >
              <Trash2 size={20} />
              <div className="flex flex-col">
                <span className="font-semibold text-sm">Delete Message</span>
                <span className="text-xs opacity-80">Remove this message from chat</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Edit Message Modal */}
      {editingMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold">Edit Message</h3>
            <textarea 
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full h-24 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-50"
              autoFocus
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setEditingMsg(null)}
                className="flex-1 rounded-xl border border-zinc-200 bg-white py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveEdit}
                className="flex-1 rounded-xl bg-brand-500 py-2 text-sm font-semibold text-white hover:bg-brand-600 shadow-md"
              >
                Save Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardingMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-base font-bold">Forward Message</h3>
              <button onClick={() => setForwardingMsg(null)} className="p-1 rounded-full text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-zinc-400">Select a chat to forward to:</p>

            <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
              {conversations
                .filter((c) => {
                  const cIsSelf = c.members.length === 1 || c.members.every(m => m.id === user?.uid);
                  const cOther = cIsSelf ? currentUserProfile : (c.members.find(m => m.id !== user?.uid) || c.members[0]);
                  return !!cOther;
                })
                .map((c) => {
                  const cIsSelf = c.members.length === 1 || c.members.every(m => m.id === user?.uid);
                  const cOther = cIsSelf ? currentUserProfile : (c.members.find(m => m.id !== user?.uid) || c.members[0])!;

                return (
                  <button
                    key={c.id}
                    onClick={() => handleForwardTo(c.id)}
                    className="flex w-full items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar src={cOther.avatar_url} online={cIsSelf ? true : cOther.is_online} size="md" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{cOther.display_name}</span>
                        {cIsSelf && <span className="text-[10px] text-brand-500 font-medium">Message yourself</span>}
                      </div>
                    </div>
                    <Forward size={18} className="text-zinc-400" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Media Gallery Modal */}
      {showMediaGallery && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white animate-in fade-in duration-200">
          <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-zinc-800">
            <h2 className="text-lg font-semibold">Shared Media ({imageMessages.length})</h2>
            <button onClick={() => setShowMediaGallery(false)} className="p-2 rounded-full hover:bg-zinc-800">
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {imageMessages.map((msg) => (
              <img 
                key={msg.id} 
                src={msg.media_url!} 
                alt="Shared media" 
                className="w-full h-40 object-cover rounded-2xl ring-1 ring-zinc-800" 
              />
            ))}
            {imageMessages.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-12 text-zinc-500">
                <ImageIcon size={48} className="mb-2 opacity-50" />
                <p>No photos shared in this chat yet</p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* User Profile Modal */}
      {showUserProfile && otherMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {otherMember.isGroup ? (otherMember.type === 'community' ? 'Community Info' : 'Group Info') : 'User Profile'}
              </h3>
              <button 
                onClick={() => setShowUserProfile(false)}
                className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex flex-col items-center flex-1 overflow-y-auto pr-1">
              <Avatar src={otherMember.avatar_url} online={!otherMember.isGroup && isOnline} size="2xl" className="mb-4 shadow-md" />
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1 text-center">
                {otherMember.display_name}
              </h2>
              
              <div className="flex items-center gap-2 mb-6">
                <span className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium",
                  otherMember.isGroup 
                    ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400" 
                    : isOnline 
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400" 
                      : getPresenceText().includes('Sleeping')
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                )}>
                  {!otherMember.isGroup && isOnline && (
                    <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  )}
                  {!otherMember.isGroup && !isOnline && getPresenceText().includes('Sleeping') && (
                    <span>🌙</span>
                  )}
                  {otherMember.isGroup ? (otherMember.type === 'community' ? 'Community' : 'Group Chat') : getPresenceText().replace('typing...', 'Online')}
                </span>
              </div>
              
              <div className="w-full space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                {otherMember.bio && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">About</span>
                    <span className="text-zinc-900 dark:text-zinc-100 text-sm leading-relaxed">{otherMember.bio}</span>
                  </div>
                )}

                {/* For groups and communities: Render members with roles */}
                {otherMember.isGroup && (
                  <div className="space-y-3 w-full">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        Members ({otherMember.membersList?.length || 0})
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 border border-zinc-100 dark:border-zinc-800 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-900/50">
                      {otherMember.membersList?.map((member: any) => {
                        const isAdmin = otherMember.admins?.includes(member.id);
                        const isCoAdmin = otherMember.coAdmins?.includes(member.id);

                        return (
                          <div key={member.id} className="flex items-center justify-between gap-2 p-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar src={member.avatar_url} size="xs" />
                              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                {member.display_name}
                              </span>
                            </div>

                            {/* Role badges */}
                            <div className="shrink-0 flex gap-1">
                              {isAdmin ? (
                                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                                  <Shield size={10} className="fill-current" />
                                  Admin
                                </span>
                              ) : isCoAdmin ? (
                                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400">
                                  <ShieldCheck size={10} />
                                  Co-Admin
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                  Member
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {!otherMember.isGroup && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{otherMember.email || 'Private'}</span>
                  </div>
                )}
                
                {!otherMember.isGroup && (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Member Since</span>
                    <span className="text-zinc-900 dark:text-zinc-100 text-sm">
                      {otherMember.created_at ? format(new Date(otherMember.created_at), 'MMMM d, yyyy') : 'Unknown'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
              {otherMember.isGroup ? (
                <button
                  onClick={() => setShowUserProfile(false)}
                  className="w-full rounded-2xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
                >
                  Close Info
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowUserProfile(false);
                      handleCall('voice');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
                  >
                    <Phone size={18} />
                    Call
                  </button>
                  <button
                    onClick={() => {
                      setShowUserProfile(false);
                      handleCall('video');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 shadow-sm shadow-brand-500/20"
                  >
                    <Video size={18} />
                    Video
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Poll Creator Modal */}
      {showPollCreator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <BarChart2 className="text-brand-500" size={20} />
                Create a Poll
              </h3>
              <button 
                onClick={() => setShowPollCreator(false)}
                className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2 space-y-4 pr-1">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Question</label>
                <input 
                  type="text"
                  placeholder="Ask a question..."
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </div>

              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Options</label>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input 
                      type="text"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...pollOptions];
                        newOpts[idx] = e.target.value;
                        setPollOptions(newOpts);
                      }}
                      className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-50"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newOpts = pollOptions.filter((_, oIdx) => oIdx !== idx);
                          setPollOptions(newOpts);
                        }}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-colors"
                      >
                        <Trash size={16} />
                      </button>
                    )}
                  </div>
                ))}

                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-dashed border-zinc-200 hover:border-brand-500 text-xs font-semibold text-zinc-500 hover:text-brand-500 dark:border-zinc-800 dark:hover:border-brand-500 transition-colors"
                  >
                    <Plus size={14} />
                    Add Option
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0 mt-4">
              <button
                type="button"
                onClick={handleCreatePoll}
                className="w-full rounded-2xl bg-brand-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 shadow-lg shadow-brand-500/25"
              >
                Launch Poll
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


