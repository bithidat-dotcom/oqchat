import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore, Message } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useCallStore } from '../store/callStore';
import { Avatar } from '../components/ui/Avatar';
import { ChevronLeft, Phone, Video, MoreVertical, Send, Paperclip, Smile, Mic, Search, X, Play, Pause, Image as ImageIcon, VolumeX, Volume2, Trash2, Reply, Forward, Edit2, CornerDownRight, Check, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { compressImage } from '../lib/imageUtils';

const EMOJI_LIST = ['😊', '😂', '❤️', '👍', '🔥', '🎉', '🚀', '😍', '😭', '🙏', '✨', '😎', '💬', '📱', '💡', '🥳', '👏', '💯', '🌟', '🍕', '☕', '🎧', '🎁', '⚽', '📸', '🔑', '🏆', '📌', '💙', '🟢'];

export default function ChatScreen() {
  const { id: conversationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, onlineUsers, profile: currentUserProfile } = useAuthStore();
  const { conversations, messages, sendMessage, clearMessages, deleteMessage, editMessage } = useChatStore();
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

  // Forward Modal state
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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

  const conversation = conversations.find(c => c.id === conversationId);
  const rawMessages = conversationId ? messages[conversationId] || [] : [];
  
  const chatMessages = searchQuery.trim() 
    ? rawMessages.filter(m => m.content && m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : rawMessages;

  const isSelf = conversation?.members.length === 1 || conversation?.members.every(m => m.id === user?.uid);
  const otherMember = isSelf ? currentUserProfile : (conversation?.members.find(m => m.id !== user?.uid) || conversation?.members[0]);
  const isOnline = isSelf ? true : (otherMember ? !!onlineUsers[otherMember.id] || otherMember.is_online : false);
  
  // Guard otherTypingTimestamp so we never check our own typing state
  const otherTypingTimestamp = (otherMember && otherMember.id !== user?.uid) 
    ? (conversation?.typing?.[otherMember.id] || null) 
    : null;
  const isTyping = otherTypingTimestamp ? (time - otherTypingTimestamp < 3000) : false;

  const getPresenceText = () => {
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
                    await sendMessage(conversationId, '', 'image', compressed, replyToMsg ? replyToMsg.id : null);
                    setReplyToMsg(null);
                    toast.success('Image sent');
                  } catch (error) {
                    toast.error('Failed to send image');
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
            
            <div className="relative flex-1">
              <input
                type="text"
                value={content}
                onChange={handleTyping}
                placeholder="Message..."
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
                content.trim() 
                  ? "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/25" 
                  : "bg-brand-500 text-white hover:bg-brand-600 shadow-sm"
              )}
            >
              {content.trim() ? <Send size={20} className="ml-1" /> : <Mic size={20} />}
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

            {/* Edit Button (only for text messages sent by user) */}
            {selectedMsg.message_type === 'text' && selectedMsg.sender_id === user?.uid && (
              <button 
                onClick={() => {
                  setEditingMsg(selectedMsg);
                  setEditText(selectedMsg.content || '');
                  setSelectedMsg(null);
                }}
                className="flex w-full items-center gap-3 p-3 rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <Edit2 size={20} className="text-amber-500" />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">Edit Text Message</span>
                  <span className="text-xs text-zinc-400">Update message content</span>
                </div>
              </button>
            )}

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
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Profile</h3>
              <button 
                onClick={() => setShowUserProfile(false)}
                className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex flex-col items-center">
              <Avatar src={otherMember.avatar_url} online={isOnline} size="2xl" className="mb-4 shadow-md" />
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
                {otherMember.display_name}
              </h2>
              
              <div className="flex items-center gap-2 mb-6">
                <span className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium",
                  isOnline 
                    ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400" 
                    : getPresenceText().includes('Sleeping')
                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                )}>
                  {isOnline ? (
                    <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                  ) : getPresenceText().includes('Sleeping') ? (
                    <span>🌙</span>
                  ) : null}
                  {getPresenceText().replace('typing...', 'Online')}
                </span>
              </div>
              
              <div className="w-full space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</span>
                  <span className="text-zinc-900 dark:text-zinc-100">{otherMember.email || 'Private'}</span>
                </div>
                
                {otherMember.bio && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">About</span>
                    <span className="text-zinc-900 dark:text-zinc-100 text-sm leading-relaxed">{otherMember.bio}</span>
                  </div>
                )}
                
                <div className="flex flex-col gap-1 pt-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Member Since</span>
                  <span className="text-zinc-900 dark:text-zinc-100 text-sm">
                    {otherMember.created_at ? format(new Date(otherMember.created_at), 'MMMM d, yyyy') : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="mt-8 flex gap-3">
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
          </div>
        </div>
      )}

    </div>
  );
}


