import { GoogleGenAI, Type } from "@google/genai";
import { STUDY_PROMPTS } from "./prompts";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateAiResponse = async (prompt: string, systemInstruction?: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || STUDY_PROMPTS.SYSTEM_INSTRUCTION,
      },
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const extractConcept = async (text: string) => {
  try {
    const response = await ai.models.generateContent({
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
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};

export const extractTopics = async (text: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: STUDY_PROMPTS.EXTRACT_TOPICS(text),
    });
    return response.text.split(",").map(t => t.trim());
  } catch (error) {
    console.error("Gemini Topic Extraction Error:", error);
    throw error;
  }
};
