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

let systemInstructionPrompt = "You are an expert e-commerce data analyst. Parse the raw Amazon JSON product array and generate a clean executive Markdown report.";
try {
  const promptPath = path.join(process.cwd(), 'prompt.md');
  if (fs.existsSync(promptPath)) {
    systemInstructionPrompt = fs.readFileSync(promptPath, 'utf-8');
  }
} catch (err) {
  console.warn("Could not load prompt.md, using fallback prompt:", err);
}

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

    // Option A: Raw JSON paste
    if (rawJson) {
      jsonArrayOutput = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    } else {
      // Option B: Amazon Product URL via Apify Scraper
      const targetUrl = url || (Array.isArray(categoryOrProductUrls) && categoryOrProductUrls[0]?.url);

      if (!targetUrl) {
        return res.status(400).json({ success: false, error: "Provide a valid Amazon product URL or raw JSON payload." });
      }

      // Execute Apify Amazon Crawler actor
      const run = await apifyClient.actor("junglee/amazon-crawler").call({
        categoryOrProductUrls: [{ url: targetUrl }],
        maxItemsPerStartUrl: 1
      });

      // Extract results dataset
      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();
      jsonArrayOutput = items;
    }

    if (!jsonArrayOutput || jsonArrayOutput.length === 0) {
      return res.status(404).json({ success: false, error: "No product data returned from scraper." });
    }

    // Call Gemini API with a supported model name
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
    console.error("Serverless Execution Error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "An error occurred while analyzing the product." 
    });
  }
});

export default app;
