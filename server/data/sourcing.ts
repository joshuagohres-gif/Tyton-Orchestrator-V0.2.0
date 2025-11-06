/**
 * Component Sourcing and Matching Service
 * 
 * Provides deterministic component matching between design specs and component DB.
 * Includes confidence scoring, pinout retrieval, and unmatched component handling.
 */

import { db } from "../db";
import { components } from "@shared/schema";
import { eq, like, or, sql } from "drizzle-orm";

export interface ComponentMatch {
  role: string;
  partNumber: string;
  componentId: string;
  confidence: 'high' | 'medium' | 'low';
  component: {
    id: string;
    mpn: string;
    manufacturer: string;
    name: string;
    category: string;
    specifications: any;
    pricing: any;
    datasheet: string | null;
  };
  pinouts: Pin[];
}

export interface Pin {
  id: string;
  name: string;
  type: 'power' | 'ground' | 'io' | 'analog' | 'pwm' | 'communication' | 'other';
  voltage?: number;
  maxVoltage?: number;
  maxCurrent?: number;
  notes?: string;
  connectionHints?: string[];
}

export interface MatchingResult {
  matched: ComponentMatch[];
  unmatched: Array<{
    role: string;
    partNumber: string;
    reason: string;
  }>;
}

/**
 * Match components from design spec against component database
 * Uses deterministic rules for matching:
 * 1. Exact MPN match (highest confidence)
 * 2. Fuzzy MPN match (medium confidence)
 * 3. Role + manufacturer match (low confidence)
 */
export async function matchComponents(
  componentSpecs: Array<{
    role: string;
    partNumber: string;
    manufacturer?: string;
    category?: string;
  }>
): Promise<MatchingResult> {
  const matched: ComponentMatch[] = [];
  const unmatched: Array<{ role: string; partNumber: string; reason: string }> = [];

  for (const spec of componentSpecs) {
    try {
      const match = await findComponentMatch(spec);
      
      if (match) {
        matched.push(match);
      } else {
        unmatched.push({
          role: spec.role,
          partNumber: spec.partNumber,
          reason: 'No matching component found in database'
        });
      }
    } catch (error) {
      console.error(`Error matching component ${spec.partNumber}:`, error);
      unmatched.push({
        role: spec.role,
        partNumber: spec.partNumber,
        reason: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { matched, unmatched };
}

/**
 * Find a single component match using deterministic rules
 */
async function findComponentMatch(spec: {
  role: string;
  partNumber: string;
  manufacturer?: string;
  category?: string;
}): Promise<ComponentMatch | null> {
  const { partNumber, manufacturer, role, category } = spec;

  // Strategy 1: Exact MPN match (case-insensitive)
  let component = await db.query.components.findFirst({
    where: sql`LOWER(${components.mpn}) = LOWER(${partNumber})`
  });

  if (component) {
    const pinouts = await extractPinouts(component);
    return {
      role,
      partNumber,
      componentId: component.id,
      confidence: 'high',
      component: {
        id: component.id,
        mpn: component.mpn,
        manufacturer: component.manufacturer,
        name: component.name,
        category: component.category,
        specifications: component.specifications,
        pricing: component.pricing,
        datasheet: component.datasheet
      },
      pinouts
    };
  }

  // Strategy 2: Fuzzy MPN match (partial, case-insensitive)
  const fuzzyPartNumber = partNumber.replace(/[-_\s]/g, '').toLowerCase();
  const fuzzyResults = await db.query.components.findMany({
    where: sql`LOWER(REPLACE(REPLACE(REPLACE(${components.mpn}, '-', ''), '_', ''), ' ', '')) LIKE ${'%' + fuzzyPartNumber + '%'}`,
    limit: 5
  });

  if (fuzzyResults.length > 0) {
    // Rank by similarity
    const ranked = fuzzyResults.map(c => ({
      component: c,
      score: calculateSimilarity(fuzzyPartNumber, c.mpn.replace(/[-_\s]/g, '').toLowerCase())
    })).sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (best.score > 0.7) {
      component = best.component;
      const pinouts = await extractPinouts(component);
      return {
        role,
        partNumber,
        componentId: component.id,
        confidence: 'medium',
        component: {
          id: component.id,
          mpn: component.mpn,
          manufacturer: component.manufacturer,
          name: component.name,
          category: component.category,
          specifications: component.specifications,
          pricing: component.pricing,
          datasheet: component.datasheet
        },
        pinouts
      };
    }
  }

  // Strategy 3: Category + manufacturer match
  if (category && manufacturer) {
    const categoryResults = await db.query.components.findMany({
      where: sql`
        LOWER(${components.category}) = LOWER(${category}) 
        AND LOWER(${components.manufacturer}) LIKE LOWER(${'%' + manufacturer + '%'})
      `,
      limit: 3
    });

    if (categoryResults.length > 0) {
      component = categoryResults[0];
      const pinouts = await extractPinouts(component);
      return {
        role,
        partNumber,
        componentId: component.id,
        confidence: 'low',
        component: {
          id: component.id,
          mpn: component.mpn,
          manufacturer: component.manufacturer,
          name: component.name,
          category: component.category,
          specifications: component.specifications,
          pricing: component.pricing,
          datasheet: component.datasheet
        },
        pinouts
      };
    }
  }

  // No match found
  return null;
}

/**
 * Extract pinout information from component specifications
 * Synthesizes default pins if none are defined
 */
async function extractPinouts(component: any): Promise<Pin[]> {
  const specs = component.specifications || {};
  const category = component.category.toLowerCase();

  // Check if pinout is explicitly defined in specifications
  if (specs.pinout && Array.isArray(specs.pinout)) {
    return specs.pinout.map((pin: any, index: number) => ({
      id: `${component.id}-pin-${index}`,
      name: pin.name || `PIN${index + 1}`,
      type: normalizePinType(pin.type || 'io'),
      voltage: pin.voltage,
      maxVoltage: pin.maxVoltage,
      maxCurrent: pin.maxCurrent,
      notes: pin.notes,
      connectionHints: pin.connectionHints || []
    }));
  }

  // Otherwise, synthesize default pinout based on category
  return synthesizeDefaultPinout(component);
}

/**
 * Synthesize a conservative default pinout based on component category
 */
function synthesizeDefaultPinout(component: any): Pin[] {
  const category = component.category.toLowerCase();
  const componentId = component.id;
  const pins: Pin[] = [];

  // Common pins for most components
  pins.push({
    id: `${componentId}-pin-vcc`,
    name: 'VCC',
    type: 'power',
    voltage: 3300, // Default 3.3V
    maxVoltage: 3600,
    maxCurrent: 500,
    notes: 'Power supply',
    connectionHints: ['Connect to appropriate voltage rail']
  });

  pins.push({
    id: `${componentId}-pin-gnd`,
    name: 'GND',
    type: 'ground',
    notes: 'Ground connection',
    connectionHints: ['Connect to ground plane']
  });

  // Category-specific pins
  if (category.includes('microcontroller') || category.includes('mcu')) {
    // MCU pins
    for (let i = 0; i < 4; i++) {
      pins.push({
        id: `${componentId}-pin-gpio${i}`,
        name: `GPIO${i}`,
        type: 'io',
        voltage: 3300,
        maxVoltage: 3600,
        maxCurrent: 25,
        notes: 'General purpose I/O',
        connectionHints: ['Can be used for digital I/O']
      });
    }

    pins.push({
      id: `${componentId}-pin-sda`,
      name: 'SDA',
      type: 'communication',
      voltage: 3300,
      notes: 'I2C data line',
      connectionHints: ['Connect to I2C bus with pull-up resistor']
    });

    pins.push({
      id: `${componentId}-pin-scl`,
      name: 'SCL',
      type: 'communication',
      voltage: 3300,
      notes: 'I2C clock line',
      connectionHints: ['Connect to I2C bus with pull-up resistor']
    });

  } else if (category.includes('sensor')) {
    // I2C sensor pins
    pins.push({
      id: `${componentId}-pin-sda`,
      name: 'SDA',
      type: 'communication',
      voltage: 3300,
      notes: 'I2C data line',
      connectionHints: ['Connect to MCU SDA']
    });

    pins.push({
      id: `${componentId}-pin-scl`,
      name: 'SCL',
      type: 'communication',
      voltage: 3300,
      notes: 'I2C clock line',
      connectionHints: ['Connect to MCU SCL']
    });

  } else if (category.includes('motor') || category.includes('servo')) {
    // Motor/servo pins
    pins.push({
      id: `${componentId}-pin-pwm`,
      name: 'PWM',
      type: 'pwm',
      voltage: 3300,
      notes: 'PWM control signal',
      connectionHints: ['Connect to MCU PWM output']
    });

  } else if (category.includes('power')) {
    // Power regulator pins
    pins.push({
      id: `${componentId}-pin-vin`,
      name: 'VIN',
      type: 'power',
      voltage: 5000,
      maxVoltage: 12000,
      notes: 'Input voltage',
      connectionHints: ['Connect to power source']
    });

    pins.push({
      id: `${componentId}-pin-vout`,
      name: 'VOUT',
      type: 'power',
      voltage: 3300,
      maxCurrent: 1000,
      notes: 'Regulated output voltage',
      connectionHints: ['Connect to circuit power rail']
    });

  } else {
    // Generic component
    pins.push({
      id: `${componentId}-pin-sig`,
      name: 'SIG',
      type: 'io',
      voltage: 3300,
      notes: 'Signal pin',
      connectionHints: ['Connect as needed']
    });
  }

  return pins;
}

/**
 * Normalize pin type to standard enum
 */
function normalizePinType(type: string): Pin['type'] {
  const typeLower = type.toLowerCase();
  
  if (typeLower.includes('power') || typeLower.includes('vcc') || typeLower.includes('vdd')) {
    return 'power';
  }
  if (typeLower.includes('ground') || typeLower.includes('gnd') || typeLower.includes('vss')) {
    return 'ground';
  }
  if (typeLower.includes('analog') || typeLower.includes('adc')) {
    return 'analog';
  }
  if (typeLower.includes('pwm')) {
    return 'pwm';
  }
  if (typeLower.includes('i2c') || typeLower.includes('spi') || typeLower.includes('uart') || 
      typeLower.includes('serial') || typeLower.includes('communication')) {
    return 'communication';
  }
  if (typeLower.includes('io') || typeLower.includes('gpio') || typeLower.includes('digital')) {
    return 'io';
  }
  
  return 'other';
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance normalized
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Get component by ID with full details
 */
export async function getComponentById(componentId: string) {
  return await db.query.components.findFirst({
    where: eq(components.id, componentId)
  });
}

/**
 * Search components by query string
 */
export async function searchComponents(query: string, limit: number = 20) {
  return await db.query.components.findMany({
    where: or(
      like(components.name, `%${query}%`),
      like(components.mpn, `%${query}%`),
      like(components.manufacturer, `%${query}%`)
    ),
    limit
  });
}
