import fs from 'fs';
import path from 'path';

export interface DocumentChunk {
  id: string;
  sourceFile: string;
  text: string;
  embedding: number[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]), 'utf-8');
}

export const db = {
  getAll(): DocumentChunk[] {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data) as DocumentChunk[];
  },
  
  save(chunks: DocumentChunk[]) {
    const existing = this.getAll();
    const updated = [...existing, ...chunks];
    fs.writeFileSync(DB_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  },
  
  clear() {
    fs.writeFileSync(DB_FILE, JSON.stringify([]), 'utf-8');
  }
};

// Cosine similarity utility
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Very basic text chunker
export function chunkText(text: string, maxChunkSize: number = 500): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.match(/[^。！？.!?]+[。！？.!?]+/g) || [text];
  
  for (const sentence of sentences) {
    if ((currentChunk.length + sentence.length) > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += sentence;
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}
