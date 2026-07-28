import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const app = express();

// Enable CORS middleware globally
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json({ limit: '10mb' }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let systemInstructionPrompt = "You are an expert e-commerce data analyst. Parse the raw Amazon JSON product object and generate a clean executive Markdown report.";
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
    res.send('🚀 Amazon Scraper Backend API (ScrapingBee Powered) is running live!');
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { url, rawJson } = req.body;
    let productData = null;

    // Option A: Raw JSON Paste Bypass
    if (rawJson) {
      productData = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    } else {
      // Option B: Amazon URL Scraping via ScrapingBee
      if (!url) {
        return res.status(400).json({ 
          success: false, 
          error: "Provide a valid Amazon product URL or raw JSON payload." 
        });
      }

      // Extract 10-character ASIN from Amazon URL
      const asinMatch = url.match(/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      const asin = asinMatch ? asinMatch[1] : null;

      if (!asin) {
        return res.status(400).json({ 
          success: false, 
          error: "Could not find a valid 10-character ASIN in the provided URL." 
        });
      }

      const apiKey = process.env.SCRAPINGBEE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          success: false, 
          error: "SCRAPINGBEE_API_KEY environment variable is missing on the server." 
        });
      }

      console.log(`[ScrapingBee] Fetching product data for ASIN: ${asin}...`);

      // Call ScrapingBee Amazon Product Endpoint (Synchronous REST API)
      const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1/amazon/product?api_key=${apiKey}&query=${asin}&country=us`;
      const response = await fetch(scrapingBeeUrl);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ScrapingBee API Error (${response.status}): ${errorText}`);
      }

      productData = await response.json();
    }

    if (!productData) {
      return res.status(404).json({ 
        success: false, 
        error: "No product data returned from ScrapingBee." 
      });
    }

    console.log("[Gemini AI] Generating executive product report...");

    // Send clean JSON output to Gemini AI
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: systemInstructionPrompt,
        temperature: 0.2
      },
      contents: JSON.stringify(productData)
    });

    res.json({
      success: true,
      markdownReport: aiResponse.text,
      rawJson: productData
    });

  } catch (error) {
    console.error("Server Execution Error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "An error occurred while analyzing the product." 
    });
  }
});

// Start Local Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Amazon Scraper Backend API (ScrapingBee Engine) running on port ${PORT}!`);
});

export default app;
