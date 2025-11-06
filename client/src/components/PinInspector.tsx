import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Alert, AlertDescription } from "./ui/alert";
import { Save, X } from "lucide-react";

interface Pin {
  id: string;
  name: string;
  type: "power" | "ground" | "io" | "analog" | "pwm" | "communication" | "other";
  voltage?: number;
  maxVoltage?: number;
  maxCurrent?: number;
  notes?: string;
  enabled: boolean;
  connectionHints?: string[];
}

interface PinInspectorProps {
  projectId: string;
  moduleId: string;
  moduleName: string;
  pins: Pin[];
  onClose?: () => void;
}

export function PinInspector({ projectId, moduleId, moduleName, pins, onClose }: PinInspectorProps) {
  const queryClient = useQueryClient();
  const [editingPin, setEditingPin] = useState<string | null>(null);
  const [pinUpdates, setPinUpdates] = useState<Record<string, Partial<Pin>>>({});

  const updatePinMutation = useMutation({
    mutationFn: async ({ pinId, updates }: { pinId: string; updates: Partial<Pin> }) => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/pins/${pinId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error("Failed to update pin");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hardware-design-modules", projectId] });
      setEditingPin(null);
      setPinUpdates({});
    }
  });

  const handleTogglePin = (pinId: string, enabled: boolean) => {
    updatePinMutation.mutate({ pinId, updates: { enabled } });
  };

  const handleEditPin = (pinId: string) => {
    const pin = pins.find(p => p.id === pinId);
    if (pin) {
      setPinUpdates({ [pinId]: { notes: pin.notes || "" } });
      setEditingPin(pinId);
    }
  };

  const handleSavePin = (pinId: string) => {
    const updates = pinUpdates[pinId];
    if (updates) {
      updatePinMutation.mutate({ pinId, updates });
    }
  };

  const handleCancelEdit = () => {
    setEditingPin(null);
    setPinUpdates({});
  };

  const getPinTypeColor = (type: string) => {
    switch (type) {
      case "power": return "bg-red-500";
      case "ground": return "bg-gray-900 text-white";
      case "io": return "bg-blue-500";
      case "analog": return "bg-yellow-500";
      case "pwm": return "bg-purple-500";
      case "communication": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Pin Configuration</CardTitle>
            <CardDescription>{moduleName}</CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {pins.length === 0 ? (
          <Alert>
            <AlertDescription>No pins found for this module.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {pins.map((pin, index) => (
              <div key={pin.id}>
                {index > 0 && <Separator className="my-3" />}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={getPinTypeColor(pin.type)}>
                        {pin.type}
                      </Badge>
                      <div>
                        <p className="font-mono font-medium">{pin.name}</p>
                        {pin.voltage && (
                          <p className="text-xs text-muted-foreground">
                            {(pin.voltage / 1000).toFixed(2)}V
                            {pin.maxCurrent && ` • ${pin.maxCurrent}mA max`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`pin-enabled-${pin.id}`} className="text-sm">
                          Enabled
                        </Label>
                        <Switch
                          id={`pin-enabled-${pin.id}`}
                          checked={pin.enabled}
                          onCheckedChange={(enabled) => handleTogglePin(pin.id, enabled)}
                          disabled={updatePinMutation.isPending}
                        />
                      </div>
                    </div>
                  </div>

                  {pin.connectionHints && pin.connectionHints.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Connection Hints:
                      </p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                        {pin.connectionHints.map((hint, i) => (
                          <li key={i}>{hint}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {editingPin === pin.id ? (
                    <div className="space-y-2">
                      <Label htmlFor={`pin-notes-${pin.id}`} className="text-sm">
                        Notes
                      </Label>
                      <Textarea
                        id={`pin-notes-${pin.id}`}
                        value={pinUpdates[pin.id]?.notes || ""}
                        onChange={(e) =>
                          setPinUpdates({
                            ...pinUpdates,
                            [pin.id]: { ...pinUpdates[pin.id], notes: e.target.value }
                          })
                        }
                        placeholder="Add notes about this pin..."
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSavePin(pin.id)}
                          disabled={updatePinMutation.isPending}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          disabled={updatePinMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {pin.notes ? (
                        <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                          {pin.notes}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No notes</p>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditPin(pin.id)}
                        className="mt-1 h-7 text-xs"
                      >
                        Edit Notes
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {updatePinMutation.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to update pin. Please try again.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
