import {
    GoogleGenAI,
    GenerateContentResponse,
    Content,
    Modality,
    LiveServerMessage,
    Blob,
} from '@google/genai';

// FIX: Using correct import from `@google/genai` and providing full implementation
// for all Gemini API calls used in the application. This resolves module not found
// errors and provides the necessary functionality for chat, image analysis, TTS, and live transcription.

// --- Audio Utility Functions ---

export function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

function encode(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// --- Gemini API Service ---

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getWeatherData(latitude: number, longitude: number): Promise<{condition: string, temperature: number} | null> {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `What is the current weather condition and temperature at latitude ${latitude} and longitude ${longitude}? Provide a short description for condition and just the number for temperature in Celsius. Respond in JSON format like {"condition": "sunny", "temperature": 25}.`,
            config: {
                responseMimeType: 'application/json',
            }
        });
        const weatherData = JSON.parse(response.text);
        if (weatherData.condition && typeof weatherData.temperature === 'number') {
            return weatherData;
        }
        return null;
    } catch (error) {
        console.error('Error getting weather data:', error);
        return null;
    }
}

export async function analyzeImage(prompt: string, imageData: string, mimeType: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { data: imageData, mimeType: mimeType } },
                { text: prompt }
            ]
        },
    });
    return response.text;
}

export async function editImage(prompt: string, imageData: string, mimeType: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { data: imageData, mimeType: mimeType } },
                { text: prompt || 'edit the image' } 
            ]
        },
        config: {
            responseModalities: [Modality.IMAGE],
        }
    });

    for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
            return part.inlineData.data;
        }
    }
    throw new Error('No image data in response for editImage');
}

export async function getChatResponse(
    history: Content[],
    prompt: string, // This is redundant as history already contains the latest prompt, but we match the call signature
    useGrounding: boolean,
    location?: { latitude: number, longitude: number }
): Promise<GenerateContentResponse> {
    const config: any = {};

    if (useGrounding) {
        const tools: any[] = [{ googleSearch: {} }];
        if (location) {
            tools.push({ googleMaps: {} });
            config.toolConfig = {
                retrievalConfig: {
                    latLng: location
                }
            };
        }
        config.tools = tools;
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: history, // history from App.tsx is the full conversation
        config: config
    });
    return response;
}

export async function generateSpeech(text: string): Promise<string> {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: `Say cheerfully: ${text}` }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        throw new Error('No audio data received from TTS API');
    }
    return audioData;
}

export function createPcmBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

export function connectToLive(callbacks: {
    onopen: () => void,
    onmessage: (message: LiveServerMessage) => void,
    onerror: (e: ErrorEvent) => void,
    onclose: (e: CloseEvent) => void
}) {
    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: callbacks,
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
        },
    });
}
