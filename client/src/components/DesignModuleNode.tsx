import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Wifi, Bluetooth, Zap, Settings } from "lucide-react";

export interface DesignModuleData {
  id: string;
  componentName: string;
  type?: string;
  voltage?: number;
  maxCurrent?: number;
  wifi?: boolean;
  bluetooth?: boolean;
  isMotorOrServo?: boolean;
  pins: Array<{
    id: string;
    name: string;
    type: "power" | "ground" | "io" | "analog" | "pwm" | "communication" | "other";
    enabled: boolean;
    voltage?: number;
    notes?: string;
  }>;
}

export const DesignModuleNode = memo(({ data, selected }: NodeProps<DesignModuleData>) => {
  const getPinColor = (pinType: string) => {
    switch (pinType) {
      case "power": return "bg-red-500";
      case "ground": return "bg-black";
      case "io": return "bg-blue-500";
      case "analog": return "bg-yellow-500";
      case "pwm": return "bg-purple-500";
      case "communication": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  const getPinPosition = (index: number, total: number): Position => {
    // Distribute pins around the node
    if (index < total / 2) {
      return Position.Left;
    } else {
      return Position.Right;
    }
  };

  // Filter enabled pins
  const enabledPins = data.pins.filter(pin => pin.enabled);
  const leftPins = enabledPins.slice(0, Math.ceil(enabledPins.length / 2));
  const rightPins = enabledPins.slice(Math.ceil(enabledPins.length / 2));

  return (
    <Card className={`min-w-[250px] ${selected ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="truncate">{data.componentName}</span>
          <div className="flex gap-1 ml-2">
            {data.wifi && <Wifi className="h-3 w-3 text-blue-500" />}
            {data.bluetooth && <Bluetooth className="h-3 w-3 text-blue-500" />}
            {data.isMotorOrServo && <Settings className="h-3 w-3 text-purple-500" />}
          </div>
        </CardTitle>
        {data.type && (
          <Badge variant="secondary" className="text-xs w-fit">
            {data.type}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-1 relative">
        {/* Left side pins */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-around">
          {leftPins.map((pin, index) => (
            <div key={pin.id} className="relative flex items-center" style={{ marginLeft: '-20px' }}>
              <Handle
                type="source"
                position={Position.Left}
                id={`${pin.id}-source`}
                style={{
                  width: 8,
                  height: 8,
                  left: -4
                }}
                className={getPinColor(pin.type)}
              />
              <Handle
                type="target"
                position={Position.Left}
                id={`${pin.id}-target`}
                style={{
                  width: 8,
                  height: 8,
                  left: -4
                }}
                className={getPinColor(pin.type)}
              />
              <span className="text-[10px] ml-2 font-mono bg-background px-1 rounded">
                {pin.name}
              </span>
            </div>
          ))}
        </div>

        {/* Center content */}
        <div className="px-8 py-2 space-y-1">
          {data.voltage && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>{(data.voltage / 1000).toFixed(1)}V</span>
            </div>
          )}
          {data.maxCurrent && (
            <div className="text-xs text-muted-foreground">
              Max: {data.maxCurrent}mA
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {enabledPins.length} pin{enabledPins.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Right side pins */}
        <div className="absolute right-0 top-0 h-full flex flex-col justify-around">
          {rightPins.map((pin, index) => (
            <div key={pin.id} className="relative flex items-center justify-end" style={{ marginRight: '-20px' }}>
              <span className="text-[10px] mr-2 font-mono bg-background px-1 rounded">
                {pin.name}
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id={`${pin.id}-source`}
                style={{
                  width: 8,
                  height: 8,
                  right: -4
                }}
                className={getPinColor(pin.type)}
              />
              <Handle
                type="target"
                position={Position.Right}
                id={`${pin.id}-target`}
                style={{
                  width: 8,
                  height: 8,
                  right: -4
                }}
                className={getPinColor(pin.type)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

DesignModuleNode.displayName = "DesignModuleNode";

// Node type definition for React Flow
export const nodeTypes = {
  designModule: DesignModuleNode,
};
