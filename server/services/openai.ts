import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "" 
});

export interface CircuitGenerationRequest {
  userBrief: string;
  projectTitle: string;
  existingComponents?: any[];
}

export interface CircuitGenerationResponse {
  components: {
    id: string;
    type: string;
    label: string;
    mpn?: string;
    specifications: Record<string, any>;
    position: { x: number; y: number };
    ports: { id: string; type: string; label: string }[];
  }[];
  connections: {
    from: { componentId: string; portId: string };
    to: { componentId: string; portId: string };
    type: string;
  }[];
  firmwareCode: string;
  explanation: string;
}

export async function generateCircuit(request: CircuitGenerationRequest): Promise<CircuitGenerationResponse> {
  const prompt = `You are an expert hardware design engineer. Generate a complete circuit design based on the following requirements:

Project: ${request.projectTitle}
Requirements: ${request.userBrief}

Generate a JSON response with the following structure:
{
  "components": [
    {
      "id": "unique_component_id",
      "type": "microcontroller|sensor|communication|power|passive",
      "label": "Human readable label",
      "mpn": "Manufacturer part number if known",
      "specifications": {
        "voltage": "3.3V",
        "current": "100mA",
        "other_specs": "..."
      },
      "position": { "x": 100, "y": 100 },
      "ports": [
        { "id": "port_id", "type": "power|data|analog|digital", "label": "GPIO0" }
      ]
    }
  ],
  "connections": [
    {
      "from": { "componentId": "comp1", "portId": "port1" },
      "to": { "componentId": "comp2", "portId": "port2" },
      "type": "power|data|analog|digital"
    }
  ],
  "firmwareCode": "Complete Arduino/ESP32 firmware code",
  "explanation": "Detailed explanation of the circuit design"
}

Focus on:
1. Practical, manufacturable components with real part numbers when possible
2. Proper power distribution and decoupling
3. Appropriate GPIO assignments
4. Complete, compilable firmware code
5. Clear, educational explanations`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert hardware design engineer specializing in IoT and embedded systems. Generate practical, manufacturable circuit designs with real components."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 4000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result as CircuitGenerationResponse;
  } catch (error) {
    throw new Error(`Circuit generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export interface ComponentSuggestionRequest {
  requirements: string;
  category: string;
  existingComponents?: string[];
}

export interface ComponentSuggestionResponse {
  suggestions: {
    mpn: string;
    manufacturer: string;
    name: string;
    description: string;
    specifications: Record<string, any>;
    reasoning: string;
    alternatives: string[];
  }[];
}

export async function suggestComponents(request: ComponentSuggestionRequest): Promise<ComponentSuggestionResponse> {
  const prompt = `Suggest hardware components for the following requirements:

Category: ${request.category}
Requirements: ${request.requirements}
${request.existingComponents ? `Existing components: ${request.existingComponents.join(', ')}` : ''}

Provide real, available components with manufacturer part numbers. Response in JSON format:
{
  "suggestions": [
    {
      "mpn": "ESP32-S3-WROOM-1",
      "manufacturer": "Espressif",
      "name": "ESP32-S3 WiFi/BLE Module",
      "description": "Dual-core WiFi and Bluetooth module",
      "specifications": {
        "voltage": "3.3V",
        "current": "240mA",
        "frequency": "240MHz",
        "connectivity": ["WiFi", "Bluetooth"]
      },
      "reasoning": "Perfect for IoT applications requiring both WiFi and Bluetooth",
      "alternatives": ["ESP32-WROOM-32", "ESP8266-12F"]
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a hardware component specialist with extensive knowledge of electronic components, their specifications, and availability."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 2000
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result as ComponentSuggestionResponse;
  } catch (error) {
    throw new Error(`Component suggestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function validateCircuit(circuitData: any): Promise<{ isValid: boolean; issues: string[]; suggestions: string[] }> {
  const prompt = `Validate this hardware circuit design and identify any issues:

Circuit Data: ${JSON.stringify(circuitData, null, 2)}

Analyze for:
1. Power supply adequacy
2. GPIO pin conflicts
3. Electrical compatibility
4. Missing connections
5. Component availability
6. Design rule violations

Return JSON format:
{
  "isValid": true/false,
  "issues": ["Issue 1", "Issue 2"],
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are a circuit validation expert. Identify electrical and design issues in hardware circuits."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 1,
      max_completion_tokens: 1500
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    throw new Error(`Circuit validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
