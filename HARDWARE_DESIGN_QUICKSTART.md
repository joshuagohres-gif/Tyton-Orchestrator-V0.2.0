# Hardware Design Assistant - Quick Start Guide

## Prerequisites

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Database**
   ```bash
   # Generate migrations
   npm run db:generate
   
   # Apply migrations
   npm run db:migrate
   ```

3. **Environment Variables**
   Ensure you have these set in your `.env`:
   ```
   DATABASE_URL=postgresql://...
   OPENAI_API_KEY=sk-...
   ```

## API Workflow

### Step 1: Start a New Hardware Design

```bash
curl -X POST http://localhost:5000/api/projects/{projectId}/hardware-design/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a WiFi-enabled temperature and humidity sensor with an OLED display"
  }'
```

**Response:**
```json
{
  "sessionId": "uuid",
  "initialDesign": {
    "designConsiderations": [
      "WiFi connectivity for remote monitoring",
      "Power consumption optimization",
      "Display readability in various lighting"
    ],
    "partSelections": [
      {
        "partType": "Microcontroller",
        "options": [
          {
            "name": "ESP32-WROOM-32",
            "pros": "Integrated WiFi, low cost, Arduino support",
            "cons": "Higher power consumption",
            "estimatedCost": 4.50
          },
          {
            "name": "ESP8266-12F",
            "pros": "Lower cost, WiFi built-in",
            "cons": "Less GPIO pins, less memory",
            "estimatedCost": 2.50
          }
        ]
      }
    ],
    "dimensions": { "length": 80, "width": 60, "height": 25, "unit": "mm" },
    "estimatedCost": 35.00
  },
  "safetyWarnings": []
}
```

### Step 2: Refine the Design

```bash
curl -X POST http://localhost:5000/api/projects/{projectId}/hardware-design/refine \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "feedback": "Use ESP32, add battery power with USB-C charging, use BME280 sensor"
  }'
```

**Response:**
```json
{
  "sessionId": "uuid",
  "designSpec": {
    "components": [
      {
        "name": "ESP32 Dev Board",
        "category": "microcontroller",
        "primaryMpn": "ESP32-DEVKITC-32D",
        "alternates": [
          { "mpn": "ESP32-WROOM-32", "manufacturer": "Espressif", "price": 4.50 }
        ],
        "specifications": { "voltage": "3.3V", "current": "500mA" },
        "quantity": 1
      },
      {
        "name": "BME280 Sensor",
        "category": "sensor",
        "primaryMpn": "BME280",
        "specifications": { "interface": "I2C", "voltage": "3.3V" },
        "quantity": 1
      }
    ],
    "connectors": [
      { "type": "USB-C", "count": 1, "specifications": "Power and programming" }
    ],
    "footprint": { "length": 85, "width": 65, "height": 20, "unit": "mm" },
    "refinedPrompt": "WiFi environmental monitor with ESP32, BME280 sensor...",
    "estimatedCost": 42.00
  },
  "safetyWarnings": []
}
```

### Step 3: Generate Master Plan

```bash
curl -X POST http://localhost:5000/api/projects/{projectId}/hardware-design/master-plan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "masterPlanId": "uuid",
  "masterPlan": {
    "summary": "Build a WiFi-enabled environmental monitoring system",
    "steps": [
      {
        "id": "step-1",
        "label": "Setup power subsystem",
        "subsystem": "power",
        "status": "todo",
        "dependsOn": [],
        "notes": "USB-C input, Li-Po charging, 3.3V regulation"
      },
      {
        "id": "step-2",
        "label": "Initialize ESP32",
        "subsystem": "control",
        "status": "todo",
        "dependsOn": ["step-1"],
        "notes": "Configure WiFi, setup GPIO pins"
      }
    ],
    "estimatedDuration": "2 weeks",
    "complexity": "medium"
  }
}
```

### Step 4: Create Modules

```bash
curl -X POST http://localhost:5000/api/projects/{projectId}/hardware-design/modules \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "modules": [
    {
      "id": "module-uuid-1",
      "componentName": "ESP32 Dev Board",
      "type": "microcontroller",
      "voltage": 3300,
      "pins": [
        {
          "id": "pin-uuid-1",
          "name": "VCC",
          "type": "power",
          "voltage": 3300,
          "enabled": true
        },
        {
          "id": "pin-uuid-2",
          "name": "GND",
          "type": "ground",
          "enabled": true
        },
        {
          "id": "pin-uuid-3",
          "name": "GPIO21",
          "type": "io",
          "voltage": 3300,
          "notes": "I2C SDA",
          "connectionHints": ["Connect to sensor SDA"],
          "enabled": true
        }
      ]
    }
  ],
  "summary": {
    "total": 3,
    "matched": 1,
    "unmatched": 2
  }
}
```

### Step 5: Enrich Actuators (if applicable)

```bash
curl -X POST http://localhost:5000/api/projects/{projectId}/hardware-design/actuators \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

This step is only needed if your design includes motors or servos.

### Step 6: Generate Wiring

```bash
curl -X POST http://localhost:5000/api/projects/{projectId}/hardware-design/wiring \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "connections": [
    {
      "id": "conn-uuid-1",
      "fromPinId": "esp32-vcc-pin",
      "toPinId": "sensor-vcc-pin",
      "kind": "power",
      "netName": "VCC_3V3",
      "notes": "Power supply to sensor"
    },
    {
      "id": "conn-uuid-2",
      "fromPinId": "esp32-gpio21-pin",
      "toPinId": "sensor-sda-pin",
      "kind": "signal",
      "netName": "I2C_SDA",
      "notes": "I2C data line"
    }
  ],
  "powerDistribution": {
    "voltageRails": ["3.3V", "5V"],
    "totalCurrent": "800mA"
  },
  "summary": {
    "totalConnections": 8,
    "powerConnections": 3,
    "groundConnections": 3,
    "signalConnections": 2
  }
}
```

## Query Data

### Get Design Session

```bash
curl http://localhost:5000/api/projects/{projectId}/hardware-design/session \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get All Modules

```bash
curl http://localhost:5000/api/projects/{projectId}/hardware-design/modules \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Master Plan

```bash
curl http://localhost:5000/api/projects/{projectId}/hardware-design/master-plan \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Connections

```bash
curl http://localhost:5000/api/projects/{projectId}/hardware-design/connections \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Update Data

### Update a Module

```bash
curl -X PUT http://localhost:5000/api/projects/{projectId}/hardware-design/modules/{moduleId} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Primary system controller",
    "position": { "x": 300, "y": 200 }
  }'
```

### Update a Pin

```bash
curl -X PUT http://localhost:5000/api/projects/{projectId}/hardware-design/pins/{pinId} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "notes": "Reserved for future use"
  }'
```

### Create Manual Connection

```bash
curl -X POST http://localhost:5000/api/projects/{projectId}/hardware-design/connections \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fromPinId": "pin-uuid-1",
    "toPinId": "pin-uuid-2",
    "kind": "signal",
    "netName": "CUSTOM_SIGNAL",
    "notes": "Manual connection for custom logic"
  }'
```

### Delete Connection

```bash
curl -X DELETE http://localhost:5000/api/projects/{projectId}/hardware-design/connections/{connectionId} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Common Use Cases

### Use Case 1: Iterate on Design

```javascript
// Start with initial prompt
await POST /hardware-design/start { prompt: "..." }

// Review, then refine
await POST /hardware-design/refine { feedback: "..." }

// Review refined spec, then continue
await POST /hardware-design/master-plan
await POST /hardware-design/modules
await POST /hardware-design/wiring

// Done! Design is complete
```

### Use Case 2: Add Motors

```javascript
// Normal flow up to modules
await POST /hardware-design/start
await POST /hardware-design/refine
await POST /hardware-design/modules

// Before wiring, enrich actuators
await POST /hardware-design/actuators

// Then complete wiring
await POST /hardware-design/wiring
```

### Use Case 3: Manual Pin Configuration

```javascript
// After modules are created
const modules = await GET /hardware-design/modules

// Disable unused pins
await PUT /hardware-design/pins/{pinId} { enabled: false }

// Add notes to important pins
await PUT /hardware-design/pins/{pinId} { 
  notes: "Connect to external interrupt" 
}

// Then generate wiring (will respect enabled state)
await POST /hardware-design/wiring
```

### Use Case 4: Custom Wiring

```javascript
// Generate automatic wiring first
await POST /hardware-design/wiring

// Review connections
const connections = await GET /hardware-design/connections

// Delete unwanted connection
await DELETE /hardware-design/connections/{badConnectionId}

// Add custom connection
await POST /hardware-design/connections {
  fromPinId: "...",
  toPinId: "...",
  kind: "signal",
  netName: "CUSTOM_NET"
}
```

## Error Handling

### 400 Bad Request
- Missing required fields
- Invalid input format

```json
{
  "error": "Prompt is required"
}
```

### 404 Not Found
- Design session doesn't exist
- Module/pin/connection not found

```json
{
  "error": "Design session not found. Start a new design first."
}
```

### 500 Internal Server Error
- LLM API failure
- Database error
- JSON parsing error

```json
{
  "error": "Failed to generate initial design",
  "details": "OpenAI API timeout"
}
```

## Tips & Best Practices

1. **Be Specific in Prompts**
   - Good: "ESP32-based WiFi thermometer with DHT22 sensor and OLED display"
   - Bad: "Make a sensor thing"

2. **Provide Detailed Feedback**
   - Include specific part numbers when possible
   - Mention power requirements
   - Specify interfaces (I2C, SPI, UART)

3. **Review Before Modules**
   - Check the refined design spec carefully
   - Ensure all components are correct
   - Modules are harder to change later

4. **Use Connection Hints**
   - Pins have connection hints to guide wiring
   - Review hints before manual connections

5. **Monitor Safety Warnings**
   - Always check `safetyWarnings` in responses
   - High voltage designs need extra care

## Troubleshooting

**Problem: "Design session not found"**
- Solution: Call `/start` endpoint first

**Problem: "No modules found"**
- Solution: Call `/modules` endpoint before `/wiring`

**Problem: Wiring connects wrong pins**
- Solution: Update pin notes/hints, or delete and recreate manually

**Problem: LLM returns invalid JSON**
- Solution: System includes auto-repair. If persistent, check prompt clarity.

**Problem: Component not in database**
- Solution: LLM will generate custom module automatically

## Next Steps

After completing the backend flow:
1. Build React frontend wizard
2. Implement React Flow canvas for modules
3. Add pin inspector UI
4. Visualize connections
5. Export to schematic formats

---

**Need Help?** See `HARDWARE_DESIGN_ASSISTANT_IMPLEMENTATION.md` for full documentation.
