import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Settings, CalendarEvent, WeatherData, GroundingSource, MessagesByDate, EventsByDate } from './types';
import useLocalStorage from './hooks/useLocalStorage';
import useGeolocation from './hooks/useGeolocation';
import * as gemini from './services/geminiService';
import { SettingsIcon, SpeakerIcon, SendIcon, PaperclipIcon, MicIcon, CloseIcon } from './components/icons';
import { LiveServerMessage, Part } from '@google/genai';


// --- i18n Translations ---
const translations = {
    en: {
        today: "Today",
        yesterday: "Yesterday",
        events: "Events",
        analyze: "Analyze",
        edit: "Edit",
        messagePlaceholder: "Message Monsmatics...",
        settingsTitle: "Settings",
        theme: "Theme",
        light: "Light",
        dark: "Dark",
        highContrast: "High Contrast",
        notificationTime: "Daily Weather Notification Time",
        tempUnit: "Temperature Unit",
        scheduledReminders: "Scheduled Reminders",
        eventTitlePlaceholder: "Event title",
        add: "Add",
        save: "Save",
        language: "Language",
        english: "English",
        turkish: "Turkish",
        listening: "Listening...",
        you: "You:",
        monsmatics: "Monsmatics:",
        endConversation: "End Conversation",
        history: "History",
        welcomeMessage: "I am Monsmatics, how can I help you?",
        errorMessage: "Sorry, I encountered an error. Please try again.",
        editedImageText: "Here is the edited image:",
        sources: "Sources:",
    },
    tr: {
        today: "Bugün",
        yesterday: "Dün",
        events: "Etkinlikler",
        analyze: "Analiz Et",
        edit: "Düzenle",
        messagePlaceholder: "Monsmatics'e mesaj gönder...",
        settingsTitle: "Ayarlar",
        theme: "Tema",
        light: "Açık",
        dark: "Koyu",
        highContrast: "Yüksek Kontrast",
        notificationTime: "Günlük Hava Durumu Bildirim Saati",
        tempUnit: "Sıcaklık Birimi",
        scheduledReminders: "Planlanmış Hatırlatıcılar",
        eventTitlePlaceholder: "Etkinlik başlığı",
        add: "Ekle",
        save: "Kaydet",
        language: "Dil",
        english: "İngilizce",
        turkish: "Türkçe",
        listening: "Dinleniyor...",
        you: "Siz:",
        monsmatics: "Monsmatics:",
        endConversation: "Görüşmeyi Bitir",
        history: "Geçmiş",
        welcomeMessage: "Ben Monsmatics, size nasıl yardımcı olabilirim?",
        errorMessage: "Üzgünüm, bir hatayla karşılaştım. Lütfen tekrar deneyin.",
        editedImageText: "İşte düzenlenmiş resim:",
        sources: "Kaynaklar:",
    }
};


// --- Utility Functions ---
const getLocalDateString = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

const formatDateForDisplay = (dateString: string, t: (key: keyof typeof translations['en']) => string) => {
    const today = getLocalDateString(new Date());
    if (dateString === today) return t('today');
    
    const date = new Date(dateString);
    // Add time zone offset to avoid date shifting
    const adjustedDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateString === getLocalDateString(yesterday)) return t('yesterday');
    
    return adjustedDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
};


// --- Child Components ---

const MessageBubble: React.FC<{ message: Message; onPlayTTS: (text: string) => void; t: (key: keyof typeof translations['en']) => string }> = ({ message, onPlayTTS, t }) => {
  const isUser = message.sender === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-prose p-4 rounded-2xl ${isUser ? 'bg-blue-500 dark:bg-blue-600 high-contrast:bg-yellow-400 text-white dark:text-white high-contrast:text-black rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded-bl-none'}`}>
        {message.image && <img src={`data:${message.image.mimeType};base64,${message.image.data}`} alt="generated content" className="rounded-lg mb-2 max-w-sm" />}
        <p className="whitespace-pre-wrap">{message.text}</p>
        {message.sources && message.sources.length > 0 && (
          <div className="mt-4 border-t border-gray-300 dark:border-gray-600 high-contrast:border-cyan-400 pt-2">
            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 high-contrast:text-cyan-400 mb-1">{t('sources')}</h4>
            <ul className="text-sm space-y-1">
              {message.sources.map((source, index) => (
                <li key={index}>
                  <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 high-contrast:text-cyan-400 hover:underline break-all">
                    {source.title || source.uri}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!isUser && (
          <button onClick={() => onPlayTTS(message.text)} className="mt-2 text-gray-500 dark:text-gray-400 high-contrast:text-cyan-400 hover:text-black dark:hover:text-white high-contrast:hover:text-yellow-400 transition-colors">
            <SpeakerIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};


interface ChatInputProps {
    onSendMessage: (text: string, image?: { data: string; type: string }, editMode?: boolean) => void;
    onStartLive: () => void;
    isLoading: boolean;
    t: (key: keyof typeof translations['en']) => string;
}
const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onStartLive, isLoading, t }) => {
    const [text, setText] = useState('');
    const [image, setImage] = useState<{data: string, type: string, file: File} | null>(null);
    const [editMode, setEditMode] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSend = () => {
        if ((!text.trim() && !image) || isLoading) return;
        onSendMessage(text, image ? { data: image.data, type: image.type } : undefined, image ? editMode : undefined);
        setText('');
        setImage(null);
        setEditMode(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64String = (event.target?.result as string).split(',')[1];
                setImage({ data: base64String, type: file.type, file: file });
            };
            reader.readAsDataURL(file);
        }
    };
    
    return (
        <div className="bg-white dark:bg-gray-800 high-contrast:bg-black high-contrast:border-t high-contrast:border-yellow-400 p-4 shrink-0">
            {image && (
                <div className="relative p-2 bg-gray-200 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded-lg mb-2 max-w-xs">
                    <img src={URL.createObjectURL(image.file)} alt="upload preview" className="rounded max-h-40"/>
                    <button onClick={() => setImage(null)} className="absolute top-1 right-1 bg-gray-800 dark:bg-gray-900 high-contrast:bg-black high-contrast:border high-contrast:border-white text-white rounded-full p-0.5">
                        <CloseIcon className="w-4 h-4"/>
                    </button>
                    <div className="mt-2 flex items-center justify-center space-x-2 text-sm">
                        <span>{t('analyze')}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={editMode} onChange={() => setEditMode(e => !e)} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-400 dark:bg-gray-600 high-contrast:bg-cyan-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 high-contrast:peer-checked:bg-yellow-400"></div>
                        </label>
                         <span>{t('edit')}</span>
                    </div>
                </div>
            )}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded-full p-2">
                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                />
                <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 dark:text-gray-400 high-contrast:text-cyan-400 hover:text-black dark:hover:text-white high-contrast:hover:text-yellow-400">
                    <PaperclipIcon className="w-6 h-6" />
                </button>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={t('messagePlaceholder')}
                    className="flex-grow bg-transparent text-black dark:text-white high-contrast:text-white placeholder-gray-500 dark:placeholder-gray-400 high-contrast:placeholder-cyan-400 focus:outline-none resize-none px-2"
                    rows={1}
                />
                <button onClick={onStartLive} className="p-2 text-gray-500 dark:text-gray-400 high-contrast:text-cyan-400 hover:text-black dark:hover:text-white high-contrast:hover:text-yellow-400">
                    <MicIcon className="w-6 h-6" />
                </button>
                <button onClick={handleSend} disabled={isLoading} className="p-2 rounded-full bg-blue-600 high-contrast:bg-yellow-400 high-contrast:text-black text-white disabled:bg-gray-400 dark:disabled:bg-gray-600 high-contrast:disabled:bg-cyan-400">
                    <SendIcon className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};

const SettingsModal: React.FC<{
    settings: Settings;
    onSave: (newSettings: Settings) => void;
    onClose: () => void;
    eventsByDate: EventsByDate;
    onAddEvent: (title: string, time: string) => void;
    onDeleteEvent: (date: string, id: string) => void;
    t: (key: keyof typeof translations['en']) => string;
}> = ({ settings, onSave, onClose, eventsByDate, onAddEvent, onDeleteEvent, t }) => {
    const [localSettings, setLocalSettings] = useState(settings);
    const [newEventTitle, setNewEventTitle] = useState('');
    const [newEventTime, setNewEventTime] = useState('');

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    const handleAddEvent = () => {
        if (newEventTitle && newEventTime) {
            onAddEvent(newEventTitle, new Date(newEventTime).toISOString());
            setNewEventTitle('');
            setNewEventTime('');
        }
    };
    
    const themeButtonClasses = (theme: Settings['theme']) => `px-4 py-2 rounded flex-1 ${localSettings.theme === theme ? 'bg-blue-600 high-contrast:bg-yellow-400 high-contrast:text-black text-white' : 'bg-gray-200 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400'}`;
    const langButtonClasses = (lang: Settings['language']) => `px-4 py-2 rounded flex-1 ${localSettings.language === lang ? 'bg-blue-600 high-contrast:bg-yellow-400 high-contrast:text-black text-white' : 'bg-gray-200 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400'}`;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 high-contrast:bg-black high-contrast:border-2 high-contrast:border-yellow-400 rounded-lg p-6 w-full max-w-md text-black dark:text-white high-contrast:text-white">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">{t('settingsTitle')}</h2>
                    <button onClick={onClose}><CloseIcon className="w-6 h-6" /></button>
                </div>
                
                <div className="space-y-6">
                     <div>
                        <label className="block mb-2 font-medium">{t('language')}</label>
                        <div className="flex gap-2">
                           <button onClick={() => setLocalSettings({...localSettings, language: 'en'})} className={langButtonClasses('en')}>{t('english')}</button>
                           <button onClick={() => setLocalSettings({...localSettings, language: 'tr'})} className={langButtonClasses('tr')}>{t('turkish')}</button>
                        </div>
                    </div>
                    <div>
                        <label className="block mb-2 font-medium">{t('theme')}</label>
                        <div className="flex gap-2">
                           <button onClick={() => setLocalSettings({...localSettings, theme: 'light'})} className={themeButtonClasses('light')}>{t('light')}</button>
                           <button onClick={() => setLocalSettings({...localSettings, theme: 'dark'})} className={themeButtonClasses('dark')}>{t('dark')}</button>
                           <button onClick={() => setLocalSettings({...localSettings, theme: 'high-contrast'})} className={themeButtonClasses('high-contrast')}>{t('highContrast')}</button>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="notificationTime" className="block mb-2 font-medium">{t('notificationTime')}</label>
                        <input
                            id="notificationTime"
                            type="time"
                            value={localSettings.notificationTime}
                            onChange={(e) => setLocalSettings({ ...localSettings, notificationTime: e.target.value })}
                            className="w-full p-2 bg-gray-100 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded"
                        />
                    </div>
                    <div>
                        <label className="block mb-2 font-medium">{t('tempUnit')}</label>
                        <div className="flex gap-2">
                           <button onClick={() => setLocalSettings({...localSettings, tempUnit: 'C'})} className={`px-4 py-2 rounded ${localSettings.tempUnit === 'C' ? 'bg-blue-600 high-contrast:bg-yellow-400 high-contrast:text-black' : 'bg-gray-200 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400'}`}>°C</button>
                           <button onClick={() => setLocalSettings({...localSettings, tempUnit: 'F'})} className={`px-4 py-2 rounded ${localSettings.tempUnit === 'F' ? 'bg-blue-600 high-contrast:bg-yellow-400 high-contrast:text-black' : 'bg-gray-200 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400'}`}>°F</button>
                        </div>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 high-contrast:border-yellow-400">
                    <h3 className="text-xl font-bold mb-2">{t('scheduledReminders')}</h3>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                        {Object.entries(eventsByDate).flatMap(([date, events]) =>
                            events.map(event => (
                                <div key={event.id} className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 p-2 rounded">
                                    <span>{event.title} at {new Date(event.time).toLocaleTimeString()} on {formatDateForDisplay(date, t)}</span>
                                    <button onClick={() => onDeleteEvent(date, event.id)} className="text-red-500 hover:text-red-400">
                                        <CloseIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                     <div className="flex gap-2 mt-4">
                        <input type="text" placeholder={t('eventTitlePlaceholder')} value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} className="w-full p-2 bg-gray-100 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded"/>
                        <input type="datetime-local" value={newEventTime} onChange={e => setNewEventTime(e.target.value)} className="p-2 bg-gray-100 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded"/>
                        <button onClick={handleAddEvent} className="bg-blue-600 high-contrast:bg-yellow-400 high-contrast:text-black px-4 rounded">{t('add')}</button>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} className="bg-blue-600 high-contrast:bg-yellow-400 high-contrast:text-black text-white px-6 py-2 rounded-lg font-semibold">{t('save')}</button>
                </div>
            </div>
        </div>
    );
};

const LiveView: React.FC<{ onClose: () => void; t: (key: keyof typeof translations['en']) => string }> = ({ onClose, t }) => {
    const [isLive, setIsLive] = useState(false);
    const [userTranscript, setUserTranscript] = useState('');
    const [aiTranscript, setAiTranscript] = useState('');
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

    const stopLiveSession = useCallback(() => {
        if(sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
        }
        streamRef.current?.getTracks().forEach(track => track.stop());
        if(scriptProcessorRef.current && audioContextRef.current) {
            scriptProcessorRef.current.disconnect(audioContextRef.current.destination);
        }
        audioContextRef.current?.close();
        setIsLive(false);
        onClose();
    }, [onClose]);

    useEffect(() => {
        let isMounted = true;
        let currentInput = '';
        let currentOutput = '';
        let nextStartTime = 0;
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outputNode = outputAudioContext.createGain();
        const sources = new Set<AudioBufferSourceNode>();
        
        const startLiveSession = async () => {
            try {
                streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                setIsLive(true);
                
                sessionPromiseRef.current = gemini.connectToLive({
                    onopen: () => {
                        if (!isMounted) return;
                        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        audioContextRef.current = inputAudioContext;
                        const source = inputAudioContext.createMediaStreamSource(streamRef.current!);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = gemini.createPcmBlob(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (!isMounted) return;
                        
                        if (message.serverContent?.inputTranscription) {
                            currentInput += message.serverContent.inputTranscription.text;
                            setUserTranscript(currentInput);
                        }
                        if (message.serverContent?.outputTranscription) {
                            currentOutput += message.serverContent.outputTranscription.text;
                            setAiTranscript(currentOutput);
                        }
                        if (message.serverContent?.turnComplete) {
                            currentInput = '';
                            currentOutput = '';
                        }
                        
                        const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData) {
                             nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                             const audioBuffer = await gemini.decodeAudioData(gemini.decode(audioData), outputAudioContext, 24000, 1);
                             const source = outputAudioContext.createBufferSource();
                             source.buffer = audioBuffer;
                             source.connect(outputNode);
                             source.addEventListener('ended', () => sources.delete(source));
                             source.start(nextStartTime);
                             nextStartTime += audioBuffer.duration;
                             sources.add(source);
                        }
                         if (message.serverContent?.interrupted) {
                            for (const source of sources.values()) {
                                source.stop();
                                sources.delete(source);
                            }
                            nextStartTime = 0;
                        }

                    },
                    onerror: (e) => console.error(e),
                    onclose: () => {
                        if (isMounted) setIsLive(false);
                    }
                });
            } catch (error) {
                console.error("Failed to start live session:", error);
                setIsLive(false);
                onClose();
            }
        };

        startLiveSession();

        return () => {
            isMounted = false;
            stopLiveSession();
        };
    }, [stopLiveSession]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50 p-4">
            <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center animate-pulse">
                <MicIcon className="w-12 h-12 text-white"/>
            </div>
            <p className="mt-4 text-2xl font-bold">{t('listening')}</p>
            <div className="w-full max-w-2xl mt-8 p-4 bg-gray-800 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded-lg h-48 overflow-y-auto">
                <p><span className="font-bold text-blue-400 high-contrast:text-yellow-400">{t('you')}</span> {userTranscript}</p>
                <p className="mt-2"><span className="font-bold text-teal-400 high-contrast:text-cyan-400">{t('monsmatics')}</span> {aiTranscript}</p>
            </div>
            <button onClick={stopLiveSession} className="mt-8 bg-red-600 text-white px-8 py-3 rounded-full font-bold">{t('endConversation')}</button>
        </div>
    );
};

const CalendarSidebar: React.FC<{
    messagesByDate: MessagesByDate;
    eventsByDate: EventsByDate;
    selectedDate: string;
    onDateSelect: (date: string) => void;
    t: (key: keyof typeof translations['en']) => string;
}> = ({ messagesByDate, eventsByDate, selectedDate, onDateSelect, t }) => {
    const dates = [...new Set([...Object.keys(messagesByDate), ...Object.keys(eventsByDate)])].sort((a,b) => b.localeCompare(a));
    const today = getLocalDateString(new Date());

    if (!dates.includes(today)) {
        dates.unshift(today);
    }
    
    return (
        <div className="w-64 bg-white dark:bg-gray-800 high-contrast:bg-black high-contrast:border-r-2 high-contrast:border-yellow-400 flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 high-contrast:border-yellow-400">
                <h1 className="text-2xl font-bold text-center">Monsmatics</h1>
            </div>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 high-contrast:border-yellow-400">
                <h2 className="text-xl font-bold">{t('history')}</h2>
            </div>
            <div className="flex-grow overflow-y-auto">
                {dates.map(date => {
                    const hasMessages = (messagesByDate[date]?.length ?? 0) > 0;
                    const hasEvents = (eventsByDate[date]?.length ?? 0) > 0;
                    const isSelected = date === selectedDate;

                    return (
                        <button 
                            key={date} 
                            onClick={() => onDateSelect(date)}
                            className={`w-full text-left p-4 border-b border-gray-200 dark:border-gray-700 high-contrast:border-gray-600 ${isSelected ? 'bg-blue-100 dark:bg-blue-900 high-contrast:bg-yellow-400 high-contrast:text-black' : 'hover:bg-gray-100 dark:hover:bg-gray-700 high-contrast:hover:bg-cyan-900'}`}
                        >
                            <p className="font-semibold">{formatDateForDisplay(date, t)}</p>
                            <div className="flex items-center space-x-2 mt-1">
                                {hasMessages && <span className="h-2 w-2 bg-blue-500 dark:bg-blue-400 high-contrast:bg-cyan-400 rounded-full" title="Has messages"></span>}
                                {hasEvents && <span className="text-xs" title="Has events">🗓️</span>}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    );
}

const LoadingIndicator = () => (
  <div className="flex justify-start mb-4">
    <div className="flex items-center space-x-1.5 p-4 rounded-2xl bg-gray-200 dark:bg-gray-700 high-contrast:bg-black high-contrast:border high-contrast:border-cyan-400 rounded-bl-none">
      <div className="w-2 h-2 bg-gray-500 dark:bg-gray-400 high-contrast:bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-gray-500 dark:bg-gray-400 high-contrast:bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-gray-500 dark:bg-gray-400 high-contrast:bg-cyan-400 rounded-full animate-bounce"></div>
    </div>
  </div>
);


// --- Main App Component ---

function App() {
  const [messagesByDate, setMessagesByDate] = useLocalStorage<MessagesByDate>('monsmatics-messages-by-date', {});
  const [eventsByDate, setEventsByDate] = useLocalStorage<EventsByDate>('monsmatics-events-by-date', {});
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString(new Date()));

  const [settings, setSettings] = useLocalStorage<Settings>('monsmatics-settings', { notificationTime: '08:00', tempUnit: 'C', theme: 'dark', language: 'en' });
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const location = useGeolocation();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const t = useCallback((key: keyof typeof translations['en']) => {
    return translations[settings.language][key] || translations['en'][key];
  }, [settings.language]);

  const currentMessages = messagesByDate[selectedDate] || [];
  const currentEvents = eventsByDate[selectedDate] || [];
  
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light', 'high-contrast');
    root.classList.add(settings.theme);
  }, [settings.theme]);

  // Add a welcome message to new chat days
  useEffect(() => {
    setMessagesByDate(prevMessages => {
        const hasMessages = prevMessages[selectedDate] && prevMessages[selectedDate].length > 0;
        if (!hasMessages) {
            const welcomeMessage: Message = {
                id: `${selectedDate}-initial`,
                text: t('welcomeMessage'),
                sender: 'ai',
            };
            return {
                ...prevMessages,
                [selectedDate]: [welcomeMessage],
            };
        }
        return prevMessages;
    });
  }, [selectedDate, setMessagesByDate, t]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);
  
  useEffect(() => {
    if (location.latitude && location.longitude) {
        gemini.getWeatherData(location.latitude, location.longitude).then(setWeather);
    }
  }, [location.latitude, location.longitude]);

  const handleSendMessage = async (text: string, image?: { data: string; type: string }, editMode?: boolean) => {
    const today = getLocalDateString(new Date());
    // If viewing an old chat, switch to today before sending
    if (selectedDate !== today) {
        setSelectedDate(today);
    }

    const userMessage: Message = { 
        id: Date.now().toString(), 
        text, 
        sender: 'user', 
        image: image ? { data: image.data, mimeType: image.type } : undefined 
    };
    setMessagesByDate(prev => ({
        ...prev,
        [today]: [...(prev[today] || []), userMessage]
    }));
    setIsLoading(true);

    try {
        let aiResponseText = '';
        let aiResponseImage: { data: string; mimeType: string; } | undefined;
        let aiResponseSources: GroundingSource[] | undefined;

        if (image && !editMode) {
            aiResponseText = await gemini.analyzeImage(text, image.data, image.type);
        } else if (image && editMode) {
            const editedImageData = await gemini.editImage(text, image.data, image.type);
            aiResponseImage = { data: editedImageData, mimeType: 'image/png' }; // Gemini image editing returns PNG
            aiResponseText = text || t('editedImageText');
        } else {
            const history = (messagesByDate[today] || []).map(m => {
                const parts: Part[] = [];
                // Gemini prefers image parts before text parts
                if (m.image) {
                    parts.push({
                        inlineData: {
                            data: m.image.data,
                            mimeType: m.image.mimeType
                        }
                    });
                }
                if (m.text) {
                    parts.push({ text: m.text });
                }
                return {
                    role: m.sender === 'user' ? 'user' : 'model' as const,
                    parts: parts
                };
            }).filter(m => m.parts.length > 0);
            
            const useGrounding = text.toLowerCase().includes("latest") || text.toLowerCase().includes("current") || text.toLowerCase().includes("nearby");
            const response = await gemini.getChatResponse(history, text, useGrounding, location.latitude && location.longitude ? { latitude: location.latitude, longitude: location.longitude } : undefined);
            
            aiResponseText = response.text;
            const rawSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            // FIX: Add Array.isArray check to prevent runtime error if rawSources is not an array.
            if (rawSources && Array.isArray(rawSources)) {
                aiResponseSources = rawSources.map((s: any) => ({
                    title: s.web?.title || s.maps?.title || 'Source',
                    uri: s.web?.uri || s.maps?.uri
                })).filter((s: GroundingSource) => s.uri);
            }
        }
        
        const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            text: aiResponseText,
            sender: 'ai',
            image: aiResponseImage,
            sources: aiResponseSources,
        };
        setMessagesByDate(prev => ({
            ...prev,
            [today]: [...(prev[today] || []), aiMessage]
        }));

    } catch (error) {
      console.error("Error with Gemini API:", error);
      const errorMessage: Message = { id: (Date.now() + 1).toString(), text: t('errorMessage'), sender: 'ai' };
      setMessagesByDate(prev => ({
          ...prev,
          [today]: [...(prev[today] || []), errorMessage]
      }));
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePlayTTS = async (text: string) => {
    try {
        const audioDataB64 = await gemini.generateSpeech(text);
        const audioData = gemini.decode(audioDataB64);
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await gemini.decodeAudioData(audioData, audioContext, 24000, 1);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
    } catch (error) {
        console.error("TTS Error:", error);
    }
  };

  const handleAddEvent = (title: string, time: string) => {
    const eventDate = getLocalDateString(new Date(time));
    const newEvent: CalendarEvent = { id: Date.now().toString(), title, time };
    setEventsByDate(prev => ({
        ...prev,
        [eventDate]: [...(prev[eventDate] || []), newEvent]
    }));
  };

  const handleDeleteEvent = (date: string, id: string) => {
    setEventsByDate(prev => {
        const updatedEvents = { ...prev };
        updatedEvents[date] = updatedEvents[date].filter(e => e.id !== id);
        if (updatedEvents[date].length === 0) {
            delete updatedEvents[date];
        }
        return updatedEvents;
    });
  };

  return (
    <div className="h-screen w-screen flex flex-row bg-gray-50 dark:bg-gray-900 high-contrast:bg-black font-sans text-black dark:text-white high-contrast:text-white overflow-hidden">
        <CalendarSidebar 
            messagesByDate={messagesByDate}
            eventsByDate={eventsByDate}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            t={t}
        />
        <div className="flex-grow flex flex-col h-screen">
            <header className="bg-white dark:bg-gray-800 high-contrast:bg-black high-contrast:border-b-2 high-contrast:border-yellow-400 p-4 flex justify-between items-center shadow-md shrink-0">
                <div>
                    <h1 className="text-xl font-bold">{formatDateForDisplay(selectedDate, t)}</h1>
                     {currentEvents.length > 0 && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 high-contrast:text-white mt-1">
                           {t('events')}: {currentEvents.map(e => e.title).join(', ')}
                        </div>
                    )}
                </div>
                 <div className="flex items-center gap-4">
                    {weather && <p className="text-sm text-gray-500 dark:text-gray-400 high-contrast:text-white text-right">{weather.condition}, {weather.temperature}°{settings.tempUnit}</p>}
                    <button onClick={() => setIsSettingsOpen(true)} className="text-gray-500 dark:text-gray-400 high-contrast:text-yellow-400 hover:text-black dark:hover:text-white high-contrast:hover:text-cyan-400">
                        <SettingsIcon className="w-6 h-6" />
                    </button>
                 </div>
            </header>

            <main className="flex-grow overflow-y-auto p-4">
                {currentMessages.map(msg => (
                <MessageBubble key={msg.id} message={msg} onPlayTTS={handlePlayTTS} t={t}/>
                ))}
                {isLoading && <LoadingIndicator />}
                <div ref={chatEndRef} />
            </main>

            <ChatInput onSendMessage={handleSendMessage} onStartLive={() => setIsLiveMode(true)} isLoading={isLoading} t={t}/>
        </div>
      
      {isSettingsOpen && (
          <SettingsModal 
              settings={settings} 
              onSave={setSettings} 
              onClose={() => setIsSettingsOpen(false)} 
              eventsByDate={eventsByDate}
              onAddEvent={handleAddEvent}
              onDeleteEvent={handleDeleteEvent}
              t={t}
          />
      )}
      {isLiveMode && <LiveView onClose={() => setIsLiveMode(false)} t={t}/>}
    </div>
  );
}

export default App;