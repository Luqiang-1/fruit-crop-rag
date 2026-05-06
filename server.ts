import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { db, chunkText, cosineSimilarity, DocumentChunk } from './src/server/db.ts';
import { getEmbedding } from './src/server/geminiService.ts';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Setup file upload handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// API: Upload Document and Index
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Only support text for MVP frame
    const text = fs.readFileSync(req.file.path, 'utf-8');
    const chunks = chunkText(text, 500);
    const documentChunks: DocumentChunk[] = [];
    
    // Get embeddings for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunkTextStr = chunks[i];
      const embedding = await getEmbedding(chunkTextStr);
      documentChunks.push({
        id: Date.now().toString() + '-' + i,
        sourceFile: req.file.originalname,
        text: chunkTextStr,
        embedding: embedding
      });
    }
    
    // Save to local db
    db.save(documentChunks);
    
    res.json({ message: `Successfully processed ${chunks.length} chunks from ${req.file.originalname}` });
  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Error processing file' });
  }
});

// API: Get KB stats
app.get('/api/kb/stats', (req, res) => {
  const allChunks = db.getAll();
  const files = [...new Set(allChunks.map(c => c.sourceFile))];
  res.json({
    chunkCount: allChunks.length,
    files: files
  });
});

// API: Clear KB
app.post('/api/kb/clear', (req, res) => {
  db.clear();
  res.json({ message: 'Knowledge base cleared' });
});

// API: RAG Chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // 1. Fetch relevant chunks using embeddings
    const messageEmbedding = await getEmbedding(message);
    const allChunks = db.getAll();
    
    // Calculate similarities
    const scoredChunks = allChunks.map(chunk => ({
      ...chunk,
      score: cosineSimilarity(messageEmbedding, chunk.embedding)
    }));
    
    // Sort and get top K (e.g., top 3)
    scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = scoredChunks.slice(0, 3);
    
    // Build context
    const contextText = topChunks.map(c => `[From file: ${c.sourceFile}]\n${c.text}`).join('\n\n');
    
    // Prompt structure to strictly enforce knowledge base
    const prompt = `你是一个果用经济作物生产管理和销售方面的智能问答助手。
请仅使用以下参考资料回答用户的问题。
如果你在参考资料中找不到答案，请明确声明“对不起，当前知识库中没有关于这个问题的相关信息。”，切勿自己编造内容。

参考知识：
${contextText || '无可用参考资料。'}

问题：
${message}
`;

    // 2. Query Gemini API
    const response = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    for await (const chunk of response) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }
    
    res.end();
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Error processing chat' });
  }
});

// Vite Middleware for Frontend
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
