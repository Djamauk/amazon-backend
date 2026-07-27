import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { ApifyClient } from 'apify-client';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Read prompt.md safely in Vercel's environment
const systemInstructionPrompt = fs.readFileSync(
  path.join(process.cwd(), 'prompt.md'),
  'utf-8'
);

app.post('/api/analyze', async (req, res) => {
  try {
    const { url, rawJson } = req.body;
    let jsonArrayOutput = null;

    if (rawJson) {
      jsonArrayOutput = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    } else if (url) {
      const run = await apifyClient.actor("junglee/amazon-crawler").call({
        directUrls: [url],
        maxItems: 1
      });
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      jsonArrayOutput = items;
    } else {
      return res.status(400).json({ error: "Provide an Amazon URL or raw JSON." });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstructionPrompt,
        temperature: 0.2
      },
      contents: JSON.stringify(jsonArrayOutput)
    });

    res.json({
      success: true,
      markdownReport: response.text,
      rawJson: jsonArrayOutput
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message || "Failed to process request" });
  }
});
app.get('/', (req, res) => {
     res.sendFile(path.join(process.cwd(), 'index.html'));
   });
export default app;
