import { GoogleGenAI, Type } from "@google/genai";
import { STUDY_PROMPTS } from "./prompts";

const getApiKey = () => {
  const key = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined);
  return key;
};

const ai = new GoogleGenAI({ apiKey: getApiKey() || '' });

export const generateAiResponse = async (prompt: string, systemInstruction?: string, signal?: AbortSignal) => {
  const request = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: systemInstruction || STUDY_PROMPTS.SYSTEM_INSTRUCTION,
    },
  });

  if (signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return Promise.race([
      request.then(r => r.text),
      new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    ]);
  }

  try {
    const response = await request;
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const extractConcept = async (text: string, signal?: AbortSignal) => {
  const request = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: STUDY_PROMPTS.EXTRACT_CONCEPT(text),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          tag_name: { type: Type.STRING },
        },
        required: ["category", "tag_name"],
      },
    },
  });

  if (signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await Promise.race([
      request.then(r => r.text),
      new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    ]);
    return JSON.parse(result);
  }

  try {
    const response = await request;
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};

export const extractTopics = async (text: string, signal?: AbortSignal) => {
  const request = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: STUDY_PROMPTS.EXTRACT_TOPICS(text),
  });

  if (signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const result = await Promise.race([
      request.then(r => r.text),
      new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    ]);
    return result.split(",").map(t => t.trim());
  }

  try {
    const response = await request;
    return response.text.split(",").map(t => t.trim());
  } catch (error) {
    console.error("Gemini Topic Extraction Error:", error);
    throw error;
  }
};
