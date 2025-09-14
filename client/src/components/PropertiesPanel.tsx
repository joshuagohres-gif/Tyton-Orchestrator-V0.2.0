import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrchestrationPanel from "./OrchestrationPanel";
import SchematicDiagram from "./SchematicDiagram";
import { OrchestrationProvider } from "@/providers/OrchestrationProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Play, FileText } from "lucide-react";
import type { ProjectWithModules } from "@/types/project";

interface PropertiesPanelProps {
  project: ProjectWithModules;
}

export default function PropertiesPanel({ project }: PropertiesPanelProps) {
  const [selectedTab, setSelectedTab] = useState("properties");
  const [selectedComponentLabel, setSelectedComponentLabel] = useState("Main Controller");
  const [clockSpeed, setClockSpeed] = useState("240");
  const [wifiMode, setWifiMode] = useState("station-ap");

  // Mock firmware code based on the design
  const firmwareCode = `#include <WiFi.h>
#include <DHT.h>

#define DHT_PIN 2
#define DHT_TYPE DHT22

DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  float temp = dht.readTemperature();
  float humidity = dht.readHumidity();
  
  // Send data...
}`;

  return (
    <aside className="w-96 bg-card border-l border-border flex flex-col" data-testid="properties-panel">
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex flex-col h-full">
        {/* Tabs Navigation */}
        <div className="border-b border-border">
          <TabsList className="grid w-full grid-cols-3 bg-transparent p-0 h-auto">
            <TabsTrigger 
              value="properties" 
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
              data-testid="tab-properties"
            >
              <Settings className="w-4 h-4 mr-2" />
              Properties
            </TabsTrigger>
            <TabsTrigger 
              value="orchestration" 
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
              data-testid="tab-orchestration"
            >
              <Play className="w-4 h-4 mr-2" />
              Orchestration
            </TabsTrigger>
            <TabsTrigger 
              value="schematic" 
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none"
              data-testid="tab-schematic"
            >
              <FileText className="w-4 h-4 mr-2" />
              Schematic
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Properties Tab Content */}
        <TabsContent value="properties" className="flex-1 overflow-y-auto m-0 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-2 text-foreground">Selected Component</h3>
            <div className="p-3 bg-secondary rounded-lg border border-border">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                  <span className="text-primary text-sm">🔧</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">ESP32-S3</p>
                  <p className="text-xs text-muted-foreground">Microcontroller Unit</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2 text-foreground">Configuration</h4>
            <div className="space-y-3">
              <div>
                <Label htmlFor="component-label" className="text-xs text-muted-foreground">
                  Component Label
                </Label>
                <Input
                  id="component-label"
                  value={selectedComponentLabel}
                  onChange={(e) => setSelectedComponentLabel(e.target.value)}
                  className="mt-1 bg-input border-border text-foreground"
                  data-testid="input-component-label"
                />
              </div>
              <div>
                <Label htmlFor="clock-speed" className="text-xs text-muted-foreground">
                  Clock Speed
                </Label>
                <Select value={clockSpeed} onValueChange={setClockSpeed}>
                  <SelectTrigger className="mt-1 bg-input border-border text-foreground" data-testid="select-clock-speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="240">240 MHz</SelectItem>
                    <SelectItem value="160">160 MHz</SelectItem>
                    <SelectItem value="80">80 MHz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="wifi-mode" className="text-xs text-muted-foreground">
                  WiFi Mode
                </Label>
                <Select value={wifiMode} onValueChange={setWifiMode}>
                  <SelectTrigger className="mt-1 bg-input border-border text-foreground" data-testid="select-wifi-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="station-ap">Station + AP</SelectItem>
                    <SelectItem value="station">Station Only</SelectItem>
                    <SelectItem value="ap">AP Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2 text-foreground">Firmware Code</h4>
            <div className="bg-secondary border border-border rounded-lg p-3">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap" data-testid="text-firmware-code">
                <code>{firmwareCode}</code>
              </pre>
            </div>
          </div>
        </TabsContent>

        {/* Orchestration Tab Content */}
        <TabsContent value="orchestration" className="flex-1 overflow-y-auto m-0">
          <OrchestrationProvider projectId={project.id}>
            <OrchestrationPanel project={project} />
          </OrchestrationProvider>
        </TabsContent>

        {/* Schematic Tab Content */}
        <TabsContent value="schematic" className="flex-1 overflow-y-auto m-0">
          <SchematicDiagram project={project} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
