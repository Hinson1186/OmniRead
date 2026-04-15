/**
 * Prompts for AI Study Assistant
 * You can edit these to change how the AI responds to different actions.
 */

export const STUDY_PROMPTS = {
  /**
   * Prompt for "Summarize/Explain" action
   */
  SUMMARIZE: (text: string) => 
    `Explain the following text in simple, easy-to-understand terms. Use clear language and keep it concise but informative: \n\n"${text}"`,

  /**
   * Prompt for "More Examples" action
   */
  EXAMPLES: (text: string) => 
    `Provide 2 or 3 real-world, practical examples to illustrate the concept discussed in this text. Make the examples relatable and clear: \n\n"${text}"`,

  /**
   * Prompt for "Extra Knowledge" action
   */
  DEEP_DIVE: (text: string) => 
    `Dive deeper into the topic mentioned in this text. Provide advanced context, historical background, or related concepts that go beyond what is written. Aim to provide unique insights: \n\n"${text}"`,

  /**
   * Prompt for "Explain Code" action
   */
  EXPLAIN_CODE: (text: string) => 
    `Act as a senior developer or mathematician. Break down this code snippet or mathematical formula step-by-step. Explain the logic, syntax, and purpose of each part clearly: \n\n"${text}"`,

  /**
   * Prompt for "Extract Concept" (used for Knowledge Base)
   */
  EXTRACT_CONCEPT: (text: string) => 
    `Analyze the following text to extract a meaningful academic or professional concept. 
    If the text is nonsense, gibberish, irrelevant, or too short to be a concept, return a JSON object with 'category' set to 'Nonsense' and 'tag_name' set to 'None'.
    Otherwise, return a JSON object with two keys: 'category' (broad subject) and 'tag_name' (specific topic).
    
    Text: "${text}"`,

  /**
   * Prompt for "Extract Topics" (used for Worth It? analysis)
   */
  EXTRACT_TOPICS: (text: string) => 
    `List the core topics covered in this document. Return ONLY a comma-separated list of topic names: \n\n"${text}"`,

  /**
   * Prompt for "Check Understanding" action
   */
  CHECK_UNDERSTANDING: (text: string) => 
    `Generate one multiple-choice question to check the user's understanding of the following text. 
    The question should be challenging but fair.
    
    Format your response EXACTLY like this:
    QUESTION: [The question text]
    A) [Option A]
    B) [Option B]
    C) [Option C]
    D) [Option D]
    CORRECT: [A, B, C, or D]
    EXPLANATION: [A brief explanation of why that answer is correct and why others are wrong]
    
    Text: "${text}"`,

  /**
   * System instruction for the AI Assistant
   */
  SYSTEM_INSTRUCTION: "You are a helpful, encouraging, and highly intelligent study assistant. Your goal is to help the user understand complex topics by providing clear, concise, and accurate information. Use Markdown for formatting to make your responses easy to read."
};
