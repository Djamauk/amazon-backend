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

const systemInstructionPrompt = fs.readFileSync(
  path.join(process.cwd(), 'prompt.md'),
  'utf-8'
);

app.get('/', (req, res) => {
  const indexPath = path.join(process.cwd(), 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('🚀 Amazon Scraper Backend API is running live!');
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { url, categoryOrProductUrls, rawJson } = req.body;
    let jsonArrayOutput = null;

    if (rawJson) {
      jsonArrayOutput = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    } else {
      // Extract target URL from request
      const targetUrl = url || (Array.isArray(categoryOrProductUrls) && categoryOrProductUrls[0]?.url);

      if (!targetUrl) {
        return res.status(400).json({ error: "Provide a valid Amazon product URL or raw JSON." });
      }

      // Apify actor "junglee/amazon-crawler" requires "categoryOrProductUrls" array format
      const run = await apifyClient.actor("junglee/amazon-crawler").call({
        categoryOrProductUrls: [{ url: targetUrl }],
        maxItemsPerStartUrl: 1
      });

      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      jsonArrayOutput = items;
    }

    if (!jsonArrayOutput || jsonArrayOutput.length === 0) {
      return res.status(404).json({ error: "No product data returned from scraper." });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstructionPrompt,
        temperature: 0.2
      },
      contents: JSON
