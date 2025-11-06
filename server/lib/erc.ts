/**
 * Electrical Rule Check (ERC) Module
 * 
 * Provides comprehensive electrical safety validation for hardware designs.
 * Checks voltage compatibility, current budgets, power distribution, and wiring rules.
 */

import type { DesignModule, DesignPin, DesignConnection } from "@shared/schema";

export interface ERCViolation {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  affectedItems: string[];
  recommendation?: string;
}

export interface ERCReport {
  passed: boolean;
  violations: ERCViolation[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  checkedRules: string[];
}

export interface ERCOptions {
  strictVoltageChecks?: boolean;
  maxVoltageTolerance?: number; // percentage
  requirePullUps?: boolean;
  checkCurrentBudget?: boolean;
  maxTotalCurrentMa?: number;
}

const defaultOptions: Required<ERCOptions> = {
  strictVoltageChecks: true,
  maxVoltageTolerance: 10, // 10%
  requirePullUps: true,
  checkCurrentBudget: true,
  maxTotalCurrentMa: 1000 // 1A default USB budget
};

/**
 * Run comprehensive ERC on hardware design
 */
export async function runERC(
  modules: (DesignModule & { pins?: DesignPin[] })[],
  connections: DesignConnection[],
  options: ERCOptions = {}
): Promise<ERCReport> {
  const opts = { ...defaultOptions, ...options };
  const violations: ERCViolation[] = [];
  const checkedRules: string[] = [];

  // Build pin lookup map
  const pinMap = new Map<string, { pin: DesignPin; module: DesignModule }>();
  for (const module of modules) {
    if (module.pins) {
      for (const pin of module.pins) {
        pinMap.set(pin.id, { pin, module });
      }
    }
  }

  // Rule 1: Voltage Compatibility
  checkedRules.push("voltage_compatibility");
  violations.push(...checkVoltageCompatibility(connections, pinMap, opts));

  // Rule 2: Current Budget
  if (opts.checkCurrentBudget) {
    checkedRules.push("current_budget");
    violations.push(...checkCurrentBudget(modules, opts));
  }

  // Rule 3: Power Distribution
  checkedRules.push("power_distribution");
  violations.push(...checkPowerDistribution(connections, pinMap));

  // Rule 4: Ground Connections
  checkedRules.push("ground_connections");
  violations.push(...checkGroundConnections(modules, connections, pinMap));

  // Rule 5: I2C Pull-ups
  if (opts.requirePullUps) {
    checkedRules.push("i2c_pullups");
    violations.push(...checkI2CPullups(connections, pinMap));
  }

  // Rule 6: Pin Type Mismatch
  checkedRules.push("pin_type_mismatch");
  violations.push(...checkPinTypeMismatch(connections, pinMap));

  // Rule 7: Floating Pins
  checkedRules.push("floating_pins");
  violations.push(...checkFloatingPins(modules, connections));

  // Rule 8: Short Circuits
  checkedRules.push("short_circuits");
  violations.push(...checkShortCircuits(connections, pinMap));

  // Rule 9: Motor/Servo Power
  checkedRules.push("motor_servo_power");
  violations.push(...checkMotorServoPower(modules, connections, pinMap));

  // Calculate summary
  const summary = {
    errors: violations.filter(v => v.severity === "error").length,
    warnings: violations.filter(v => v.severity === "warning").length,
    infos: violations.filter(v => v.severity === "info").length
  };

  return {
    passed: summary.errors === 0,
    violations,
    summary,
    checkedRules
  };
}

/**
 * Check voltage compatibility between connected pins
 */
function checkVoltageCompatibility(
  connections: DesignConnection[],
  pinMap: Map<string, { pin: DesignPin; module: DesignModule }>,
  opts: Required<ERCOptions>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  for (const conn of connections) {
    const fromData = pinMap.get(conn.fromPinId);
    const toData = pinMap.get(conn.toPinId);

    if (!fromData || !toData) continue;

    const fromPin = fromData.pin;
    const toPin = toData.pin;

    // Skip ground connections
    if (fromPin.type === "ground" || toPin.type === "ground") continue;

    // Check max voltage violations
    if (fromPin.voltage && toPin.maxVoltage) {
      if (fromPin.voltage > toPin.maxVoltage) {
        violations.push({
          severity: "error",
          code: "ERC001",
          message: `Voltage exceeds maximum: ${fromData.module.componentName}.${fromPin.name} (${fromPin.voltage}mV) connected to ${toData.module.componentName}.${toPin.name} (max ${toPin.maxVoltage}mV)`,
          affectedItems: [conn.id, fromPin.id, toPin.id],
          recommendation: `Add level shifter or voltage divider, or choose compatible components`
        });
      }
    }

    if (toPin.voltage && fromPin.maxVoltage) {
      if (toPin.voltage > fromPin.maxVoltage) {
        violations.push({
          severity: "error",
          code: "ERC001",
          message: `Voltage exceeds maximum: ${toData.module.componentName}.${toPin.name} (${toPin.voltage}mV) connected to ${fromData.module.componentName}.${fromPin.name} (max ${fromPin.maxVoltage}mV)`,
          affectedItems: [conn.id, fromPin.id, toPin.id],
          recommendation: `Add level shifter or voltage divider, or choose compatible components`
        });
      }
    }

    // Check voltage level mismatch (with tolerance)
    if (fromPin.voltage && toPin.voltage && opts.strictVoltageChecks) {
      const diff = Math.abs(fromPin.voltage - toPin.voltage);
      const avgVoltage = (fromPin.voltage + toPin.voltage) / 2;
      const tolerance = opts.maxVoltageTolerance / 100;

      if (diff > avgVoltage * tolerance) {
        violations.push({
          severity: "warning",
          code: "ERC002",
          message: `Voltage level mismatch: ${fromData.module.componentName}.${fromPin.name} (${fromPin.voltage}mV) and ${toData.module.componentName}.${toPin.name} (${toPin.voltage}mV) differ by ${diff}mV`,
          affectedItems: [conn.id, fromPin.id, toPin.id],
          recommendation: `Verify voltage levels are compatible; consider level shifter if needed`
        });
      }
    }
  }

  return violations;
}

/**
 * Check total current budget
 */
function checkCurrentBudget(
  modules: (DesignModule & { pins?: DesignPin[] })[],
  opts: Required<ERCOptions>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  let totalCurrentMa = 0;
  const currentDraws: Array<{ module: string; current: number }> = [];

  for (const module of modules) {
    const current = module.maxCurrent || module.avgPowerDraw || 0;
    if (current > 0) {
      totalCurrentMa += current;
      currentDraws.push({ module: module.componentName, current });
    }
  }

  if (totalCurrentMa > opts.maxTotalCurrentMa) {
    violations.push({
      severity: "error",
      code: "ERC010",
      message: `Total current budget exceeded: ${totalCurrentMa}mA > ${opts.maxTotalCurrentMa}mA`,
      affectedItems: currentDraws.map(cd => cd.module),
      recommendation: `Reduce power consumption, use external power supply, or optimize component selection. Current breakdown: ${currentDraws.map(cd => `${cd.module}: ${cd.current}mA`).join(", ")}`
    });
  } else if (totalCurrentMa > opts.maxTotalCurrentMa * 0.8) {
    violations.push({
      severity: "warning",
      code: "ERC011",
      message: `Current budget near limit: ${totalCurrentMa}mA (${Math.round(totalCurrentMa / opts.maxTotalCurrentMa * 100)}% of ${opts.maxTotalCurrentMa}mA)`,
      affectedItems: currentDraws.map(cd => cd.module),
      recommendation: `Consider headroom for peak current draw`
    });
  }

  return violations;
}

/**
 * Check power distribution (VCC connections)
 */
function checkPowerDistribution(
  connections: DesignConnection[],
  pinMap: Map<string, { pin: DesignPin; module: DesignModule }>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  // Find all power rails
  const powerRails = new Map<string, Set<string>>(); // netName -> pinIds

  for (const conn of connections) {
    if (conn.kind === "power" && conn.netName) {
      if (!powerRails.has(conn.netName)) {
        powerRails.set(conn.netName, new Set());
      }
      powerRails.get(conn.netName)!.add(conn.fromPinId);
      powerRails.get(conn.netName)!.add(conn.toPinId);
    }
  }

  // Check each power rail for voltage consistency
  for (const [netName, pinIds] of powerRails) {
    const voltages = new Set<number>();
    
    for (const pinId of pinIds) {
      const pinData = pinMap.get(pinId);
      if (pinData && pinData.pin.voltage) {
        voltages.add(pinData.pin.voltage);
      }
    }

    if (voltages.size > 1) {
      violations.push({
        severity: "error",
        code: "ERC020",
        message: `Power rail "${netName}" has inconsistent voltages: ${Array.from(voltages).join(", ")}mV`,
        affectedItems: Array.from(pinIds),
        recommendation: `Use separate power rails for different voltages or add voltage regulation`
      });
    }
  }

  return violations;
}

/**
 * Check ground connections
 */
function checkGroundConnections(
  modules: (DesignModule & { pins?: DesignPin[] })[],
  connections: DesignConnection[],
  pinMap: Map<string, { pin: DesignPin; module: DesignModule }>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  // Find all ground pins
  const groundPins = new Set<string>();
  const connectedGroundPins = new Set<string>();

  for (const module of modules) {
    if (module.pins) {
      for (const pin of module.pins) {
        if (pin.type === "ground" && pin.enabled) {
          groundPins.add(pin.id);
        }
      }
    }
  }

  // Track which ground pins are connected
  for (const conn of connections) {
    if (conn.kind === "ground") {
      connectedGroundPins.add(conn.fromPinId);
      connectedGroundPins.add(conn.toPinId);
    }
  }

  // Check for unconnected ground pins
  for (const pinId of groundPins) {
    if (!connectedGroundPins.has(pinId)) {
      const pinData = pinMap.get(pinId);
      if (pinData) {
        violations.push({
          severity: "error",
          code: "ERC030",
          message: `Ground pin not connected: ${pinData.module.componentName}.${pinData.pin.name}`,
          affectedItems: [pinId],
          recommendation: `Connect all ground pins to common ground plane`
        });
      }
    }
  }

  return violations;
}

/**
 * Check I2C pull-up requirements
 */
function checkI2CPullups(
  connections: DesignConnection[],
  pinMap: Map<string, { pin: DesignPin; module: DesignModule }>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  // Find I2C nets (SDA/SCL)
  const i2cNets = new Map<string, string[]>(); // netName -> pinIds

  for (const conn of connections) {
    if (conn.netName && (conn.netName.includes("I2C") || conn.netName.includes("SDA") || conn.netName.includes("SCL"))) {
      if (!i2cNets.has(conn.netName)) {
        i2cNets.set(conn.netName, []);
      }
      i2cNets.get(conn.netName)!.push(conn.fromPinId, conn.toPinId);
    }
  }

  if (i2cNets.size > 0) {
    violations.push({
      severity: "info",
      code: "ERC040",
      message: `I2C bus detected: Ensure pull-up resistors (typically 4.7kΩ) are present on SDA and SCL lines`,
      affectedItems: Array.from(i2cNets.values()).flat(),
      recommendation: `Add 4.7kΩ pull-up resistors to VCC on SDA and SCL lines`
    });
  }

  return violations;
}

/**
 * Check for pin type mismatches
 */
function checkPinTypeMismatch(
  connections: DesignConnection[],
  pinMap: Map<string, { pin: DesignPin; module: DesignModule }>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  for (const conn of connections) {
    const fromData = pinMap.get(conn.fromPinId);
    const toData = pinMap.get(conn.toPinId);

    if (!fromData || !toData) continue;

    const fromType = fromData.pin.type;
    const toType = toData.pin.type;

    // Power should only connect to power
    if (fromType === "power" && toType !== "power") {
      violations.push({
        severity: "error",
        code: "ERC050",
        message: `Power pin connected to non-power pin: ${fromData.module.componentName}.${fromData.pin.name} (${fromType}) -> ${toData.module.componentName}.${toData.pin.name} (${toType})`,
        affectedItems: [conn.id, fromData.pin.id, toData.pin.id],
        recommendation: `Connect power pins only to power pins`
      });
    }

    // Ground should only connect to ground
    if (fromType === "ground" && toType !== "ground") {
      violations.push({
        severity: "error",
        code: "ERC051",
        message: `Ground pin connected to non-ground pin: ${fromData.module.componentName}.${fromData.pin.name} (${fromType}) -> ${toData.module.componentName}.${toData.pin.name} (${toType})`,
        affectedItems: [conn.id, fromData.pin.id, toData.pin.id],
        recommendation: `Connect ground pins only to ground pins`
      });
    }
  }

  return violations;
}

/**
 * Check for floating (unconnected) pins
 */
function checkFloatingPins(
  modules: (DesignModule & { pins?: DesignPin[] })[],
  connections: DesignConnection[]
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  const connectedPins = new Set<string>();
  
  for (const conn of connections) {
    connectedPins.add(conn.fromPinId);
    connectedPins.add(conn.toPinId);
  }

  for (const module of modules) {
    if (!module.pins) continue;

    for (const pin of module.pins) {
      if (!pin.enabled) continue;
      if (pin.type === "other") continue; // Skip optional pins

      if (!connectedPins.has(pin.id)) {
        violations.push({
          severity: "warning",
          code: "ERC060",
          message: `Floating pin: ${module.componentName}.${pin.name} (${pin.type}) is not connected`,
          affectedItems: [pin.id],
          recommendation: `Connect pin or disable it if not needed`
        });
      }
    }
  }

  return violations;
}

/**
 * Check for potential short circuits
 */
function checkShortCircuits(
  connections: DesignConnection[],
  pinMap: Map<string, { pin: DesignPin; module: DesignModule }>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  // Group connections by net
  const nets = new Map<string, DesignConnection[]>();
  
  for (const conn of connections) {
    if (conn.netName) {
      if (!nets.has(conn.netName)) {
        nets.set(conn.netName, []);
      }
      nets.get(conn.netName)!.push(conn);
    }
  }

  // Check each net for power/ground shorts
  for (const [netName, conns] of nets) {
    const pinIds = new Set<string>();
    
    for (const conn of conns) {
      pinIds.add(conn.fromPinId);
      pinIds.add(conn.toPinId);
    }

    let hasPower = false;
    let hasGround = false;

    for (const pinId of pinIds) {
      const pinData = pinMap.get(pinId);
      if (pinData) {
        if (pinData.pin.type === "power") hasPower = true;
        if (pinData.pin.type === "ground") hasGround = true;
      }
    }

    if (hasPower && hasGround) {
      violations.push({
        severity: "error",
        code: "ERC070",
        message: `Potential short circuit: Net "${netName}" connects both power and ground pins`,
        affectedItems: Array.from(pinIds),
        recommendation: `Check wiring; power and ground should never be directly connected`
      });
    }
  }

  return violations;
}

/**
 * Check motor/servo power requirements
 */
function checkMotorServoPower(
  modules: (DesignModule & { pins?: DesignPin[] })[],
  connections: DesignConnection[],
  pinMap: Map<string, { pin: DesignPin; module: DesignModule }>
): ERCViolation[] {
  const violations: ERCViolation[] = [];

  const motorModules = modules.filter(m => m.isMotorOrServo);

  for (const motor of motorModules) {
    // Check if motor has power connection
    const motorPins = motor.pins || [];
    const powerPins = motorPins.filter(p => p.type === "power");
    
    if (powerPins.length === 0) {
      violations.push({
        severity: "warning",
        code: "ERC080",
        message: `Motor/servo module "${motor.componentName}" has no power pins defined`,
        affectedItems: [motor.id],
        recommendation: `Ensure motor has proper power connections`
      });
      continue;
    }

    // Check if power pins are connected
    const connectedPowerPins = powerPins.filter(pin =>
      connections.some(c => c.fromPinId === pin.id || c.toPinId === pin.id)
    );

    if (connectedPowerPins.length === 0) {
      violations.push({
        severity: "error",
        code: "ERC081",
        message: `Motor/servo "${motor.componentName}" power pins are not connected`,
        affectedItems: [motor.id],
        recommendation: `Connect motor power pins to appropriate power supply`
      });
    }

    // Check current requirements
    if (motor.maxCurrent && motor.maxCurrent > 500) {
      violations.push({
        severity: "info",
        code: "ERC082",
        message: `Motor/servo "${motor.componentName}" requires high current (${motor.maxCurrent}mA)`,
        affectedItems: [motor.id],
        recommendation: `Consider using separate power supply or current driver for motor`
      });
    }
  }

  return violations;
}

/**
 * Get human-readable severity icon
 */
export function getSeverityIcon(severity: ERCViolation['severity']): string {
  switch (severity) {
    case "error": return "❌";
    case "warning": return "⚠️";
    case "info": return "ℹ️";
  }
}

/**
 * Format ERC report as text
 */
export function formatERCReport(report: ERCReport): string {
  let output = "=== ERC Report ===\n\n";
  
  output += `Status: ${report.passed ? "✅ PASSED" : "❌ FAILED"}\n`;
  output += `Errors: ${report.summary.errors}, Warnings: ${report.summary.warnings}, Info: ${report.summary.infos}\n`;
  output += `Rules checked: ${report.checkedRules.join(", ")}\n\n`;

  if (report.violations.length > 0) {
    output += "Violations:\n\n";
    
    for (const violation of report.violations) {
      output += `${getSeverityIcon(violation.severity)} [${violation.code}] ${violation.message}\n`;
      if (violation.recommendation) {
        output += `   Recommendation: ${violation.recommendation}\n`;
      }
      output += `   Affected: ${violation.affectedItems.join(", ")}\n\n`;
    }
  } else {
    output += "✅ No violations found!\n";
  }

  return output;
}
