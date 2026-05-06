import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text,
    });
    // The response structure object gives embeddings.
    if (response.embeddings && response.embeddings.length > 0) {
      return response.embeddings[0].values;
    }
    throw new Error('No embedding returned from API');
  } catch (error) {
    console.error('Error getting embedding:', error);
    throw error;
  }
}
