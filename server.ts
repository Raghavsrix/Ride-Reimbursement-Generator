import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Lazy initializer for Gemini client
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required but missing. Please configure it in your Settings.');
    }
    geminiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Extract Ride Receipt endpoint using Gemini API
app.post('/api/extract-receipt', async (req, res) => {
  try {
    const { text, provider } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No email content provided for extraction.' });
    }

    const ai = getGeminiClient();

    const providerName = provider || 'Uber/Rapido';
    const systemPrompt = `You are an expert data extraction assistant.
You are given the text of a receipt email from ${providerName}.
Your objective is to extract the ride receipt information and format it exactly according to the schema provided.

Rules:
1. "fare": Extract the final total paid/charged fare as a float/decimal number. Do not include currency symbols in this field (e.g. for "₹350.00" extract 350.00). Look for headers like 'Total', 'Fare', 'Amount Charged', 'Total Bill', 'Total Paid'.
2. "currency": Extract the 3-letter ISO currency code. Map currency symbols to codes (e.g., '₹' or 'Rs' -> 'INR', '$' -> 'USD', '€' -> 'EUR'). Default to 'INR' if unsure.
3. "date": The date when the ride took place in YYYY-MM-DD format. Look for trip dates, transaction dates, or trip history headers.
4. "time": The exact time the trip started or request was made. Formats like "HH:MM AM/PM" or "HH:MM" (24h) are acceptable (e.g. "08:30 PM", "22:15").
5. "pickup": The pickup address/location name. Try to extract a clean name (e.g., "Airport Terminal 2" or "Indiranagar, Bangalore").
6. "dropoff": The dropoff/destination address or location name.
7. "confidence": Estimate your extraction confidence score between 0.0 and 1.0.

Be precise. If a field cannot be found, set it to an empty string or omit it. Do not hallucinate or make up addresses.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: `Extract the receipt data from this email content: \n\n${text}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fare: {
              type: Type.NUMBER,
              description: 'The final total paid or charged fare amount of the ride.',
            },
            currency: {
              type: Type.STRING,
              description: 'The 3-letter currency code (e.g., INR, USD).',
            },
            date: {
              type: Type.STRING,
              description: 'The date of the ride in YYYY-MM-DD format.',
            },
            time: {
              type: Type.STRING,
              description: 'The time of the ride (e.g. "08:45 PM" or "21:10").',
            },
            pickup: {
              type: Type.STRING,
              description: 'The pickup address or location.',
            },
            dropoff: {
              type: Type.STRING,
              description: 'The dropoff address or destination.',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'A float confidence value between 0.0 and 1.0.',
            },
          },
          required: ['fare', 'currency'],
        },
      },
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error('Gemini API returned an empty response.');
    }

    const parsedData = JSON.parse(textResult);
    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error('Error in extraction API:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during receipt data extraction.',
    });
  }
});

// Configure Vite or Static Asset Serving
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted in development mode.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving static files in production mode.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

setupServer().catch((err) => {
  console.error('Failed to start full-stack server:', err);
});
