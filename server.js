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

// Helper function to safely load system prompt without crashing on Vercel
function loadSystemPrompt() {
  let fallbackPrompt = "You are an expert e-commerce data analyst. Parse the raw Amazon JSON product object and generate a clean executive Markdown report.";
  try {
    const promptPath = path.join(process.cwd(), 'prompt.md');
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf-8');
    }
  } catch (err) {
    console.warn("Could not load prompt.md, using fallback prompt:", err);
  }
  return fallbackPrompt;
}

// Health Check / Homepage Route
app.get('/', (req, res) => {
  try {
    const indexPath = path.join(process.cwd(), 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send('🚀 Amazon Scraper Backend API (ScrapingBee Engine) is running live!');
    }
  } catch (err) {
    res.status(200).send('🚀 Amazon Scraper Backend API is running!');
  }
});

// Primary Analysis API Route
app.post('/api/analyze', async (req, res) => {
  try {
    // 1. Verify Gemini API Key exists
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY environment variable is missing in Vercel settings."
      });
    }

    const { url, rawJson } = req.body || {};
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

      const scrapingBeeKey = process.env.SCRAPINGBEE_API_KEY;
      if (!scrapingBeeKey) {
        return res.status(500).json({ 
          success: false, 
          error: "SCRAPINGBEE_API_KEY environment variable is missing on Vercel server." 
        });
      }

      console.log(`[ScrapingBee] Fetching product data for ASIN: ${asin}...`);

      // Call ScrapingBee Amazon Product Endpoint
      const scrapingBeeUrl = `https://app.scrapingbee.com/api/v1/amazon/product?api_key=${scrapingBeeKey}&query=${asin}&country=us`;
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

    console.log("[Gemini AI] Initializing AI client & generating report...");
    
    // Initialize Google Gen AI inside request to prevent boot-time crashes
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const systemInstructionPrompt = loadSystemPrompt();

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

// Only start local HTTP listener if NOT running inside Vercel serverless environment
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Local Server running on port ${PORT}`);
  });
}

// Export Express app as a Vercel Serverless Function module
export default app;
