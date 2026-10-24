import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getSocket } from '@/utils/socket';
import { IoSend, IoPersonCircleOutline, IoClose, IoChevronBack, IoAttach, IoImageOutline, IoDocumentTextOutline, IoSearchOutline } from 'react-icons/io5';
import moment from 'moment';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { getServerUrl } from '@/lib/api';

const ChatSidebar = ({ isOpen, onClose }) => {
    const [conversations, setConversations] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [user, setUser] = useState(null);
    const [searchMsg, setSearchMsg] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const { theme } = useTheme();

    useEffect(() => {
        if (!isOpen) return;

        const storedUser = JSON.parse(localStorage.getItem('user'));
        setUser(storedUser);
        fetchConversations();

        const socket = getSocket();
        if (socket) {
            socket.on('receive_message', (data) => {
                if (selectedUser && selectedUser.id === data.senderId) {
                    setMessages(prev => [...prev, data]);
                }
                fetchConversations();
            });
        }

        return () => {
            if (socket) socket.off('receive_message');
        };
    }, [isOpen, selectedUser]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchConversations = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setConversations(res.data);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        }
    };

    const fetchMessages = async (userId) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/messages/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setMessages(res.data);
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    const handleSelectUser = (user) => {
        setSelectedUser(user);
        fetchMessages(user.id);
        markAsRead(user.id);
    };

    const markAsRead = async (senderId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/messages/read/${senderId}`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchConversations();
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    };

    const handleSendMessage = async (e, file = null) => {
        if (e) e.preventDefault();
        if (!newMessage.trim() && !file) return;

        const formData = new FormData();
        formData.append('receiverId', selectedUser.id);
        if (newMessage.trim()) formData.append('message', newMessage);
        if (file) formData.append('attachment', file);

        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/messages`, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            const socket = getSocket();
            if (socket) {
                socket.emit('send_message', res.data);
            }

            setMessages(prev => [...prev, res.data]);
            setNewMessage('');
            fetchConversations();
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            handleSendMessage(null, file);
        }
    };

    const handleSearchMessages = async (query) => {
        setSearchMsg(query);
        if (!query.trim()) {
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/chat/messages/${selectedUser.id}/search?query=${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setSearchResults(res.data);
        } catch (error) {
            console.error('Error searching messages:', error);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100000]"
                    />

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-full max-w-[380px] sm:w-[380px] bg-white shadow-2xl z-[100001] flex flex-col"
                    >
                        {/* Header */}
                        <div
                            className="p-4 flex items-center justify-between sticky top-0 z-10 shadow-sm"
                            style={{ backgroundColor: theme.primaryColor || '#2563eb' }}
                        >
                            {selectedUser ? (
                                <button onClick={() => setSelectedUser(null)} className="flex items-center text-white/90 hover:text-white transition-colors">
                                    <IoChevronBack className="text-xl" />
                                    <span className="ml-1 text-sm font-medium">Back</span>
                                </button>
                            ) : (
                                <h2 className="text-lg font-semibold text-white">Internal Chat</h2>
                            )}
                            <button onClick={onClose} className="p-2 hover:bg-black/10 rounded-full transition-colors">
                                <IoClose className="text-2xl text-white" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden flex flex-col">
                            {!selectedUser ? (
                                // Conversation List
                                <div className="flex-1 overflow-y-auto">
                                    {conversations.length > 0 ? (
                                        conversations.map((convUser) => (
                                            <div
                                                key={convUser.id}
                                                className="p-4 flex items-center cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50"
                                                onClick={() => handleSelectUser(convUser)}
                                            >
                                                <div className="relative">
                                                    <IoPersonCircleOutline className="text-4xl text-gray-400" />
                                                    {convUser.unreadCount > 0 && (
                                                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-medium border-2 border-white dark:border-gray-900">
                                                            {convUser.unreadCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="ml-3 flex-1 overflow-hidden">
                                                    <div className="flex justify-between items-start">
                                                        <h3 className="font-semibold text-sm text-gray-800 truncate">{convUser.name || convUser.username}</h3>
                                                        <span className="text-[10px] text-gray-400">{convUser.role}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 truncate">{convUser.branch?.name || 'Main Office'}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
                                            <IoPersonCircleOutline className="text-6xl mb-4 opacity-20" />
                                            <p className="text-sm">No other users found</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // Chat Messages
                                <>
                                    <div className="p-3 bg-gray-50 flex items-center justify-between border-b border-gray-100">
                                        <div className="flex items-center">
                                            <IoPersonCircleOutline className="text-3xl text-gray-400" />
                                            <div className="ml-2">
                                                <h3 className="text-sm font-medium text-gray-800 leading-none">{selectedUser.name || selectedUser.username}</h3>
                                                <span className="text-[10px] text-green-500 font-medium">Online</span>
                                            </div>
                                        </div>

                                        {/* Message Search */}
                                        <div className="relative w-32">
                                            <IoSearchOutline className="absolute left-2 top-2 text-gray-400 text-xs" />
                                            <input
                                                type="text"
                                                placeholder="Search..."
                                                className="w-full pl-7 pr-2 py-1 bg-white rounded-md text-[10px] focus:outline-none border border-gray-200"
                                                value={searchMsg}
                                                onChange={(e) => handleSearchMessages(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                                        {(isSearching ? searchResults : messages).map((msg, idx) => (
                                            <div
                                                key={idx}
                                                className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm relative ${msg.senderId === user?.id
                                                    ? 'text-white rounded-br-none'
                                                    : 'bg-gray-100 text-gray-800 rounded-bl-none'
                                                    }`}
                                                    style={msg.senderId === user?.id ? { backgroundColor: theme.primaryColor || '#2563eb' } : {}}
                                                >
                                                    {msg.attachmentUrl && (
                                                        <div className="mb-2">
                                                            {msg.attachmentType === 'IMAGE' ? (
                                                                <img
                                                                    src={`${getServerUrl()}${msg.attachmentUrl}`}
                                                                    alt="attachment"
                                                                    className="rounded-lg max-w-full h-auto cursor-pointer"
                                                                    onClick={() => window.open(`${getServerUrl()}${msg.attachmentUrl}`, '_blank')}
                                                                />
                                                            ) : (
                                                                <a
                                                                    href={`${getServerUrl()}${msg.attachmentUrl}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={`flex items-center p-2 rounded-lg text-[10px] ${msg.senderId === user?.id ? 'bg-white/20 text-white' : 'bg-white text-gray-700 border border-gray-100'}`}
                                                                >
                                                                    <IoDocumentTextOutline className="text-xl mr-2" />
                                                                    <span className="truncate">{msg.attachmentName || 'Document'}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}
                                                    {msg.message && <p className="text-xs leading-relaxed">{msg.message}</p>}
                                                    <p className={`text-[9px] mt-1 text-right ${msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-400'}`}>
                                                        {moment(msg.createdAt).format('HH:mm')}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input Area */}
                                    <form className="p-3 bg-white border-t border-gray-100" onSubmit={(e) => handleSendMessage(e)}>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current.click()}
                                                className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                                            >
                                                <IoAttach className="text-xl" />
                                            </button>
                                            <input
                                                type="file"
                                                className="hidden"
                                                ref={fileInputRef}
                                                onChange={handleFileChange}
                                            />
                                            <input
                                                type="text"
                                                autoFocus
                                                placeholder="Type message..."
                                                className="flex-1 px-4 py-2 bg-gray-50 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                            />
                                            <button
                                                type="submit"
                                                className="p-2 text-white rounded-full transition-colors disabled:opacity-50 shadow-md"
                                                disabled={!newMessage.trim()}
                                                style={{ backgroundColor: theme.primaryColor || '#2563eb' }}
                                            >
                                                <IoSend className="text-sm" />
                                            </button>
                                        </div>
                                    </form>
                                </>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ChatSidebar;
