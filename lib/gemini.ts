import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL_NAME = "gemini-2.0-flash"; // Hardcoded to bypass 3.6-flash rate limits

export { SchemaType };

export async function callStructured<T>(
  systemPrompt: string,
  userMessage: string,
  responseSchema: Record<string, unknown>,
  zodParse: (input: unknown) => T,
  maxRetries = 1
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema as never,
        },
      });

      const result = await model.generateContent(userMessage);
      const text = result.response.text();
      const parsed = JSON.parse(text);

      return zodParse(parsed);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) continue;
    }
  }

  throw lastError ?? new Error("Structured call failed after retries");
}

export async function chatCompletion(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userMessage);
  return result.response.text();
}
