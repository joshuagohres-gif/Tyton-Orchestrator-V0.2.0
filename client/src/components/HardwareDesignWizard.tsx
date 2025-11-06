import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { Alert, AlertDescription } from "./ui/alert";
import { Progress } from "./ui/progress";
import { Badge } from "./ui/badge";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface HardwareDesignWizardProps {
  projectId: string;
  onComplete?: () => void;
}

export function HardwareDesignWizard({ projectId, onComplete }: HardwareDesignWizardProps) {
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [initialDesign, setInitialDesign] = useState<any>(null);
  const [designSpec, setDesignSpec] = useState<any>(null);
  const [masterPlan, setMasterPlan] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);

  // Mutations for each step
  const startMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt })
      });
      if (!response.ok) throw new Error("Failed to start design");
      return response.json();
    },
    onSuccess: (data) => {
      setInitialDesign(data.initialDesign);
      setStep(2);
    }
  });

  const refineMutation = useMutation({
    mutationFn: async (feedback: string) => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ feedback })
      });
      if (!response.ok) throw new Error("Failed to refine design");
      return response.json();
    },
    onSuccess: (data) => {
      setDesignSpec(data.designSpec);
      setStep(3);
    }
  });

  const masterPlanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/master-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to generate master plan");
      return response.json();
    },
    onSuccess: (data) => {
      setMasterPlan(data.masterPlan);
      setStep(4);
    }
  });

  const modulesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to generate modules");
      return response.json();
    },
    onSuccess: (data) => {
      setModules(data.modules);
      setStep(5);
    }
  });

  const wiringMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/hardware-design/wiring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to generate wiring");
      return response.json();
    },
    onSuccess: () => {
      setStep(6);
      if (onComplete) onComplete();
    }
  });

  const handleStart = () => {
    if (prompt.trim()) {
      startMutation.mutate(prompt);
    }
  };

  const handleRefine = () => {
    if (feedback.trim()) {
      refineMutation.mutate(feedback);
    }
  };

  const handleGenerateMasterPlan = () => {
    masterPlanMutation.mutate();
  };

  const handleGenerateModules = () => {
    modulesMutation.mutate();
  };

  const handleGenerateWiring = () => {
    wiringMutation.mutate();
  };

  const progressPercentage = (step / 6) * 100;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-3xl font-bold">Hardware Design Assistant</h2>
        <Progress value={progressPercentage} className="h-2" />
        <p className="text-sm text-muted-foreground">
          Step {step} of 6
        </p>
      </div>

      {/* Step 1: Initial Prompt */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Describe Your Hardware Project</CardTitle>
            <CardDescription>
              Provide a detailed description of the hardware product you want to create.
              Include functionality, requirements, and any specific components you have in mind.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Example: Create a WiFi-enabled temperature and humidity sensor with an OLED display and battery power..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
            />
            <Button
              onClick={handleStart}
              disabled={!prompt.trim() || startMutation.isPending}
            >
              {startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Initial Design
            </Button>
            {startMutation.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to generate initial design. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review Initial Design & Provide Feedback */}
      {step === 2 && initialDesign && (
        <Card>
          <CardHeader>
            <CardTitle>Initial Design Review</CardTitle>
            <CardDescription>
              Review the design considerations and part selections. Provide feedback to refine the design.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Design Considerations</h4>
                <ul className="list-disc list-inside space-y-1">
                  {initialDesign.designConsiderations?.map((consideration: string, i: number) => (
                    <li key={i} className="text-sm">{consideration}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Part Selections</h4>
                {initialDesign.partSelections?.map((selection: any, i: number) => (
                  <div key={i} className="mb-3 p-3 border rounded">
                    <p className="font-medium">{selection.partType}</p>
                    {selection.options?.map((option: any, j: number) => (
                      <div key={j} className="mt-2 pl-4 text-sm">
                        <p className="font-medium">{option.name} - ${option.estimatedCost}</p>
                        <p className="text-green-600">Pros: {option.pros}</p>
                        <p className="text-red-600">Cons: {option.cons}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <Badge variant="outline">
                  Dimensions: {initialDesign.dimensions?.length}x
                  {initialDesign.dimensions?.width}x
                  {initialDesign.dimensions?.height}
                  {initialDesign.dimensions?.unit}
                </Badge>
                <Badge variant="outline">
                  Estimated Cost: ${initialDesign.estimatedCost}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Your Feedback</label>
              <Textarea
                placeholder="Example: Use ESP32 instead of ESP8266. Add battery power with USB-C charging. Use BME280 sensor..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep(1)} variant="outline">
                Back
              </Button>
              <Button
                onClick={handleRefine}
                disabled={!feedback.trim() || refineMutation.isPending}
              >
                {refineMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Refine Design
              </Button>
            </div>
            {refineMutation.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to refine design. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review Refined Design Spec */}
      {step === 3 && designSpec && (
        <Card>
          <CardHeader>
            <CardTitle>Refined Design Specification</CardTitle>
            <CardDescription>
              Review the final design specification before generating the project plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Components</h4>
                {designSpec.components?.map((comp: any, i: number) => (
                  <div key={i} className="p-3 border rounded mb-2">
                    <p className="font-medium">{comp.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {comp.category} - {comp.primaryMpn}
                    </p>
                    {comp.alternates && comp.alternates.length > 0 && (
                      <p className="text-xs mt-1">
                        Alternates: {comp.alternates.map((a: any) => a.mpn).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <h4 className="font-semibold mb-2">Connectors</h4>
                {designSpec.connectors?.map((conn: any, i: number) => (
                  <Badge key={i} variant="secondary" className="mr-2">
                    {conn.count}x {conn.type}
                  </Badge>
                ))}
              </div>

              <div className="flex gap-4">
                <Badge variant="outline">
                  Footprint: {designSpec.footprint?.length}x
                  {designSpec.footprint?.width}x
                  {designSpec.footprint?.height}
                  {designSpec.footprint?.unit}
                </Badge>
                <Badge variant="outline">
                  Cost: ${designSpec.estimatedCost}
                </Badge>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep(2)} variant="outline">
                Back
              </Button>
              <Button
                onClick={handleGenerateMasterPlan}
                disabled={masterPlanMutation.isPending}
              >
                {masterPlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Master Plan
              </Button>
            </div>
            {masterPlanMutation.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to generate master plan. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Master Plan */}
      {step === 4 && masterPlan && (
        <Card>
          <CardHeader>
            <CardTitle>Master Plan</CardTitle>
            <CardDescription>
              Structured plan for implementing your hardware design.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{masterPlan.summary}</p>
            
            <div className="space-y-2">
              {masterPlan.steps?.map((step: any, i: number) => (
                <div key={i} className="p-3 border rounded flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">{step.label}</p>
                    {step.subsystem && (
                      <Badge variant="secondary" className="mt-1">
                        {step.subsystem}
                      </Badge>
                    )}
                    {step.notes && (
                      <p className="text-sm text-muted-foreground mt-1">{step.notes}</p>
                    )}
                    {step.dependsOn && step.dependsOn.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Depends on: {step.dependsOn.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {masterPlan.estimatedDuration && (
              <Badge variant="outline">
                Estimated Duration: {masterPlan.estimatedDuration}
              </Badge>
            )}

            <div className="flex gap-2">
              <Button onClick={() => setStep(3)} variant="outline">
                Back
              </Button>
              <Button
                onClick={handleGenerateModules}
                disabled={modulesMutation.isPending}
              >
                {modulesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Modules
              </Button>
            </div>
            {modulesMutation.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to generate modules. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 5: Modules Created */}
      {step === 5 && modules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Modules Created</CardTitle>
            <CardDescription>
              {modules.length} module(s) have been created with their pins.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {modules.map((module: any, i: number) => (
                <div key={i} className="p-4 border rounded">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{module.componentName}</p>
                      <p className="text-sm text-muted-foreground">{module.type}</p>
                    </div>
                    {module.componentId && (
                      <Badge variant="secondary">Matched in DB</Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {module.pins?.slice(0, 5).map((pin: any) => (
                      <Badge key={pin.id} variant="outline" className="text-xs">
                        {pin.name}
                      </Badge>
                    ))}
                    {module.pins?.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{module.pins.length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setStep(4)} variant="outline">
                Back
              </Button>
              <Button
                onClick={handleGenerateWiring}
                disabled={wiringMutation.isPending}
              >
                {wiringMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Wiring
              </Button>
            </div>
            {wiringMutation.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Failed to generate wiring. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 6: Complete */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Design Complete!</CardTitle>
            <CardDescription>
              Your hardware design is ready. Modules and wiring have been created.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                All modules and connections have been generated. You can now view them in the project canvas.
              </AlertDescription>
            </Alert>
            <Button onClick={onComplete}>
              Open in Canvas
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
