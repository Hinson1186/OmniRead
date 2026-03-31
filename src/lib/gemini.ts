import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateAiResponse = async (prompt: string, systemInstruction?: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || "You are a helpful study assistant.",
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
      contents: `Extract the single most important concept or topic from this text. Return ONLY a JSON object with two keys: 'category' (broad subject) and 'tag_name' (specific topic): ${text}`,
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
      contents: `List the core topics covered in this document. Return ONLY a comma-separated list of topic names: ${text}`,
    });
    return response.text.split(",").map(t => t.trim());
  } catch (error) {
    console.error("Gemini Topic Extraction Error:", error);
    throw error;
  }
};
